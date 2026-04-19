"""
Tests for StreamChatView (SSE streaming endpoint).
"""

import json
import secrets
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from app.domain.chat.gateways import LLMConfigurationError, RagStreamChunk
from app.use_cases.billing.exceptions import AiAnswersLimitExceeded, OverQuotaError
from app.use_cases.chat.exceptions import LLMProviderError

User = get_user_model()
Video = apps.get_model("app", "Video")
VideoGroup = apps.get_model("app", "VideoGroup")
VideoGroupMember = apps.get_model("app", "VideoGroupMember")


def _parse_sse_events(raw: str) -> list[dict]:
    """Parse SSE text into a list of event dicts."""
    events = []
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            data = line[len("data:"):].strip()
            if data:
                events.append(json.loads(data))
    return events


def _fake_stream_reply(chunks=None, citations=None):
    """Return a function that patches stream_reply to yield given chunks."""
    def _side_effect(self_or_gateway, messages, user_id, video_ids=None, locale=None, api_key=None, group_context=None):
        for text in (chunks or ["Hello ", "World"]):
            yield RagStreamChunk(text=text)
        yield RagStreamChunk(is_final=True, citations=citations, query_text="test")
    return _side_effect


class StreamChatViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="streamer",
            email="stream@example.com",
            password="testpass123",
        )
        self.user.ai_answers_limit = 1000
        self.user.save()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.video = Video.objects.create(
            user=self.user,
            title="Stream Video",
            description="desc",
            status="completed",
        )
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Stream Group",
            description="desc",
            share_slug=secrets.token_urlsafe(32),
        )
        VideoGroupMember.objects.create(group=self.group, video=self.video, order=0)

    def _post_stream(self, data):
        url = reverse("chat-messages-stream")
        return self.client.post(url, data, format="json")

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.stream_reply", _fake_stream_reply())
    def test_returns_event_stream_content_type(self):
        response = self._post_stream({
            "messages": [{"role": "user", "content": "Hello"}],
            "group_id": self.group.id,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/event-stream", response.get("Content-Type", ""))

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.stream_reply", _fake_stream_reply())
    def test_yields_content_chunk_events(self):
        response = self._post_stream({
            "messages": [{"role": "user", "content": "Hello"}],
            "group_id": self.group.id,
        })
        content = b"".join(response.streaming_content).decode()
        events = _parse_sse_events(content)
        content_events = [e for e in events if e.get("type") == "content_chunk"]
        self.assertEqual(len(content_events), 2)
        self.assertEqual(content_events[0]["text"], "Hello ")
        self.assertEqual(content_events[1]["text"], "World")

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.stream_reply", _fake_stream_reply())
    def test_yields_done_event_at_end(self):
        response = self._post_stream({
            "messages": [{"role": "user", "content": "Hello"}],
            "group_id": self.group.id,
        })
        content = b"".join(response.streaming_content).decode()
        events = _parse_sse_events(content)
        done_events = [e for e in events if e.get("type") == "done"]
        self.assertEqual(len(done_events), 1)
        done = done_events[0]
        self.assertIn("chat_log_id", done)
        self.assertIn("feedback", done)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.stream_reply", _fake_stream_reply())
    def test_done_event_is_last(self):
        response = self._post_stream({
            "messages": [{"role": "user", "content": "Hello"}],
        })
        content = b"".join(response.streaming_content).decode()
        events = _parse_sse_events(content)
        self.assertEqual(events[-1]["type"], "done")

    def test_returns_400_on_empty_messages(self):
        response = self._post_stream({"messages": []})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_returns_400_on_missing_messages(self):
        response = self._post_stream({})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.stream_reply")
    def test_yields_error_event_on_llm_config_error(self, mock_stream):
        mock_stream.side_effect = LLMConfigurationError("Invalid API key")

        response = self._post_stream({
            "messages": [{"role": "user", "content": "Hello"}],
            "group_id": self.group.id,
        })
        content = b"".join(response.streaming_content).decode()
        events = _parse_sse_events(content)
        error_events = [e for e in events if e.get("type") == "error"]
        self.assertEqual(len(error_events), 1)
        self.assertEqual(error_events[0]["code"], "LLM_CONFIGURATION_ERROR")

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.stream_reply")
    def test_yields_error_event_on_llm_provider_error(self, mock_stream):
        mock_stream.side_effect = LLMProviderError("provider exploded")

        response = self._post_stream({
            "messages": [{"role": "user", "content": "Hello"}],
            "group_id": self.group.id,
        })
        content = b"".join(response.streaming_content).decode()
        events = _parse_sse_events(content)
        error_events = [e for e in events if e.get("type") == "error"]
        self.assertEqual(len(error_events), 1)
        self.assertEqual(error_events[0]["code"], "LLM_PROVIDER_ERROR")
        # Must not expose internal error details
        self.assertNotIn("provider exploded", error_events[0].get("message", ""))

    @patch("app.use_cases.billing.check_ai_answers_limit.CheckAiAnswersLimitUseCase.execute")
    def test_yields_error_event_on_over_quota(self, mock_check):
        mock_check.side_effect = OverQuotaError("Over quota")

        response = self._post_stream({
            "messages": [{"role": "user", "content": "Hello"}],
            "group_id": self.group.id,
        })
        content = b"".join(response.streaming_content).decode()
        events = _parse_sse_events(content)
        error_events = [e for e in events if e.get("type") == "error"]
        self.assertEqual(len(error_events), 1)
        self.assertEqual(error_events[0]["code"], "OVER_QUOTA")

    @patch("app.use_cases.billing.check_ai_answers_limit.CheckAiAnswersLimitUseCase.execute")
    def test_yields_error_event_on_ai_answers_limit_exceeded(self, mock_check):
        mock_check.side_effect = AiAnswersLimitExceeded("AI answers limit exceeded")

        response = self._post_stream({
            "messages": [{"role": "user", "content": "Hello"}],
            "group_id": self.group.id,
        })
        content = b"".join(response.streaming_content).decode()
        events = _parse_sse_events(content)
        error_events = [e for e in events if e.get("type") == "error"]
        self.assertEqual(len(error_events), 1)
        self.assertEqual(error_events[0]["code"], "AI_ANSWERS_LIMIT_EXCEEDED")
