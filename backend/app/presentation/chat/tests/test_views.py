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

from app.domain.chat.dtos import RelatedVideoDTO
from app.domain.chat.gateways import LLMConfigurationError, RagResult

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
        # Generate share_token for testing
        share_token = secrets.token_urlsafe(32)
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
            share_token=share_token,
        )
        VideoGroupMember.objects.create(group=self.group, video=self.video, order=0)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_with_group(self, mock_generate_reply):
        """Test chat with group_id"""
        mock_generate_reply.return_value = RagResult(
            content="Test response",
            query_text="Test question",
            related_videos=[
                RelatedVideoDTO(
                    video_id=self.video.id, title="Test Video", start_time=None, end_time=None
                )
            ],
        )

        url = reverse("chat")
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "assistant")
        self.assertEqual(response.data["content"], "Test response")
        self.assertIn("related_videos", response.data)
        self.assertIn("chat_log_id", response.data)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_without_group(self, mock_generate_reply):
        """Test chat without group_id"""
        mock_generate_reply.return_value = RagResult(
            content="Test response",
            query_text="Test question",
            related_videos=None,
        )

        url = reverse("chat")
        data = {"messages": [{"role": "user", "content": "Test question"}]}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "assistant")
        self.assertNotIn("related_videos", response.data)
        self.assertNotIn("chat_log_id", response.data)

    def test_chat_empty_messages(self):
        """Test chat with empty messages"""
        url = reverse("chat")
        data = {"messages": []}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    def test_chat_missing_messages(self):
        """Test chat with missing messages"""
        url = reverse("chat")
        data = {}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_group_not_found(self, mock_generate_reply):
        """Test chat with non-existent group"""
        url = reverse("chat")
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

        url = reverse("chat")
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_with_share_token(self, mock_generate_reply):
        """Test chat with share token"""
        mock_generate_reply.return_value = RagResult(
            content="Test response",
            query_text="Test question",
            related_videos=None,
        )

        # Don't force authenticate - use share token instead
        self.client.force_authenticate(user=None)
        url = reverse("chat")
        url += f"?share_token={self.group.share_token}"
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

    def test_chat_share_token_group_not_found(self):
        """Test chat with share token but group not found"""
        url = reverse("chat")
        url += "?share_token=invalid-token"
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_chat_share_token_missing_group_id(self):
        """Test chat with share token but missing group_id"""
        url = reverse("chat")
        url += f"?share_token={self.group.share_token}"
        data = {"messages": [{"role": "user", "content": "Test question"}]}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.infrastructure.external.rag_gateway.RagChatGateway.generate_reply")
    def test_chat_related_videos_serialized_as_dicts(self, mock_generate_reply):
        """related_videos in HTTP response must be plain dicts, not DTO objects."""
        mock_generate_reply.return_value = RagResult(
            content="reply",
            query_text="q",
            related_videos=[
                RelatedVideoDTO(
                    video_id=self.video.id,
                    title="Test Video",
                    start_time="00:00:10",
                    end_time="00:00:20",
                )
            ],
        )

        url = reverse("chat")
        data = {
            "messages": [{"role": "user", "content": "q"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        related = response.data["related_videos"]
        self.assertIsInstance(related[0], dict)
        self.assertEqual(related[0]["video_id"], self.video.id)
        self.assertEqual(related[0]["start_time"], "00:00:10")
