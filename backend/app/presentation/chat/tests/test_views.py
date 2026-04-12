"""
Tests for chat views
"""

import secrets
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from app.domain.chat.dtos import CitationDTO
from app.domain.chat.gateways import LLMConfigurationError, RagResult
from app.use_cases.billing.exceptions import AiAnswersLimitExceeded, OverQuotaError
from app.use_cases.chat.exceptions import LLMProviderError

User = get_user_model()
ChatLog = apps.get_model("app", "ChatLog")
Video = apps.get_model("app", "Video")
VideoGroup = apps.get_model("app", "VideoGroup")
VideoGroupMember = apps.get_model("app", "VideoGroupMember")


class ChatViewTests(APITestCase):
    """Tests for ChatView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            description="Test Description",
            status="completed",
        )
        # Generate share_slug for testing
        share_slug = secrets.token_urlsafe(32)
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
            share_slug=share_slug,
        )
        VideoGroupMember.objects.create(group=self.group, video=self.video, order=0)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_with_group(self, mock_generate_reply):
        """Test chat with group_id"""
        mock_generate_reply.return_value = RagResult(
            content="Test response",
            query_text="Test question",
            citations=[
                CitationDTO(
                    video_id=self.video.id, title="Test Video", start_time=None, end_time=None
                )
            ],
        )

        url = reverse("chat-messages")
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "assistant")
        self.assertEqual(response.data["content"], "Test response")
        self.assertIn("citations", response.data)
        self.assertIn("chat_log_id", response.data)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_without_group(self, mock_generate_reply):
        """Test chat without group_id"""
        mock_generate_reply.return_value = RagResult(
            content="Test response",
            query_text="Test question",
            citations=None,
        )

        url = reverse("chat-messages")
        data = {"messages": [{"role": "user", "content": "Test question"}]}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "assistant")
        self.assertNotIn("citations", response.data)
        self.assertNotIn("chat_log_id", response.data)

    def test_chat_empty_messages(self):
        """Test chat with empty messages"""
        url = reverse("chat-messages")
        data = {"messages": []}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_chat_missing_messages(self):
        """Test chat with missing messages"""
        url = reverse("chat-messages")
        data = {}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_group_not_found(self, mock_generate_reply):
        """Test chat with non-existent group"""
        url = reverse("chat-messages")
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": 99999,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_llm_error(self, mock_generate_reply):
        """Test chat when LLM is not configured"""
        mock_generate_reply.side_effect = LLMConfigurationError(
            "OpenAI API key is not configured"
        )

        url = reverse("chat-messages")
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_provider_error_returns_generic_500_message(self, mock_generate_reply):
        """500 responses must not expose internal provider error details."""
        mock_generate_reply.side_effect = LLMProviderError("provider stack trace detail")

        url = reverse("chat-messages")
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertEqual(
            response.data,
            {
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An internal server error occurred.",
                }
            },
        )

    @patch("app.use_cases.billing.check_ai_answers_limit.CheckAiAnswersLimitUseCase.execute")
    def test_chat_returns_403_when_over_quota(self, mock_check):
        """is_over_quota=True must return 403 OVER_QUOTA to the client."""
        mock_check.side_effect = OverQuotaError(
            "AI chat is unavailable: account storage is over the configured limit."
        )

        url = reverse("chat-messages")
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["error"]["code"], "OVER_QUOTA")

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_with_share_slug(self, mock_generate_reply):
        """Test chat with share slug"""
        mock_generate_reply.return_value = RagResult(
            content="Test response",
            query_text="Test question",
            citations=None,
        )

        # Don't force authenticate - use share token instead
        self.client.force_authenticate(user=None)
        url = reverse("chat-messages")
        url += f"?share_slug={self.group.share_slug}"
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("chat_log_id", response.data)
        # Check that chat log is created with is_shared_origin=True
        chat_log = ChatLog.objects.get(id=response.data["chat_log_id"])
        self.assertTrue(chat_log.is_shared_origin)

    def test_chat_share_slug_group_not_found(self):
        """Test chat with share slug but group not found"""
        url = reverse("chat-messages")
        url += "?share_slug=invalid-token"
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_chat_share_slug_missing_group_id(self):
        """Test chat with share slug but missing group_id"""
        url = reverse("chat-messages")
        url += f"?share_slug={self.group.share_slug}"
        data = {"messages": [{"role": "user", "content": "Test question"}]}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_citations_serialized_as_dicts(self, mock_generate_reply):
        """citations in HTTP response must be plain dicts."""
        mock_generate_reply.return_value = RagResult(
            content="reply",
            query_text="q",
            citations=[
                CitationDTO(
                    video_id=self.video.id,
                    title="Test Video",
                    start_time="00:00:10",
                    end_time="00:00:20",
                )
            ],
        )

        url = reverse("chat-messages")
        data = {
            "messages": [{"role": "user", "content": "q"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        citation = response.data["citations"][0]
        self.assertIsInstance(citation, dict)
        self.assertEqual(citation["id"], 1)
        self.assertEqual(citation["video_id"], self.video.id)
        self.assertEqual(citation["start_time"], "00:00:10")
        self.assertEqual(response.data["citations"][0]["id"], 1)
        self.assertEqual(response.data["citations"][0]["video_id"], self.video.id)


class OpenAIChatCompletionsViewTests(APITestCase):
    """Regression tests for OpenAIChatCompletionsView limit exception handling."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="openai_testuser",
            email="openai_test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("openai-chat-completions")
        self.payload = {
            "model": "videoq",
            "messages": [{"role": "user", "content": "Hello"}],
        }

    @patch("app.use_cases.billing.check_ai_answers_limit.CheckAiAnswersLimitUseCase.execute")
    def test_over_quota_returns_403_with_openai_error_format(self, mock_check):
        """OverQuotaError must return 403 in OpenAI-compatible error format."""
        mock_check.side_effect = OverQuotaError(
            "AI chat is unavailable: account storage is over the configured limit."
        )

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("error", response.data)
        self.assertEqual(response.data["error"]["type"], "insufficient_quota")

    @patch("app.use_cases.billing.check_ai_answers_limit.CheckAiAnswersLimitUseCase.execute")
    def test_ai_answers_limit_exceeded_returns_400_with_openai_error_format(self, mock_check):
        """AiAnswersLimitExceeded must return 400 in OpenAI-compatible error format."""
        mock_check.side_effect = AiAnswersLimitExceeded("AI answers limit exceeded. Limit: 100.")

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)
        self.assertEqual(response.data["error"]["type"], "insufficient_quota")
