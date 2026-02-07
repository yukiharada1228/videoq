"""
Tests for chat views
"""

import secrets
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from app.models import ChatLog, Video, VideoGroup, VideoGroupMember

User = get_user_model()


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

    @patch("app.chat.views.get_langchain_llm")
    @patch("app.chat.views.RagChatService")
    def test_chat_with_group(self, mock_service_class, mock_get_llm):
        """Test chat with group_id"""
        mock_llm = MagicMock()
        mock_get_llm.return_value = (mock_llm, None)

        mock_service = MagicMock()
        mock_result = MagicMock()
        mock_result.llm_response.content = "Test response"
        mock_result.query_text = "Test question"
        mock_result.related_videos = [self.video.id]
        mock_service.run.return_value = mock_result
        mock_service_class.return_value = mock_service

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

    @patch("app.chat.views.get_langchain_llm")
    @patch("app.chat.views.RagChatService")
    def test_chat_without_group(self, mock_service_class, mock_get_llm):
        """Test chat without group_id"""
        mock_llm = MagicMock()
        mock_get_llm.return_value = (mock_llm, None)

        mock_service = MagicMock()
        mock_result = MagicMock()
        mock_result.llm_response.content = "Test response"
        mock_result.query_text = "Test question"
        mock_result.related_videos = None
        mock_service.run.return_value = mock_result
        mock_service_class.return_value = mock_service

        url = reverse("chat")
        data = {"messages": [{"role": "user", "content": "Test question"}]}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["role"], "assistant")
        self.assertNotIn("related_videos", response.data)
        self.assertNotIn("chat_log_id", response.data)

    @patch("app.chat.views.get_langchain_llm")
    def test_chat_empty_messages(self, mock_get_llm):
        """Test chat with empty messages"""
        mock_llm = MagicMock()
        mock_get_llm.return_value = (mock_llm, None)

        url = reverse("chat")
        data = {"messages": []}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", response.data)

    @patch("app.chat.views.get_langchain_llm")
    def test_chat_missing_messages(self, mock_get_llm):
        """Test chat with missing messages"""
        mock_llm = MagicMock()
        mock_get_llm.return_value = (mock_llm, None)

        url = reverse("chat")
        data = {}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.chat.views.get_langchain_llm")
    def test_chat_group_not_found(self, mock_get_llm):
        """Test chat with non-existent group"""
        mock_llm = MagicMock()
        mock_get_llm.return_value = (mock_llm, None)

        url = reverse("chat")
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": 99999,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("app.chat.views.get_langchain_llm")
    def test_chat_llm_error(self, mock_get_llm):
        """Test chat with LLM error"""
        from app.common.responses import create_error_response

        error_response = create_error_response(
            "OpenAI API key is not configured", status.HTTP_400_BAD_REQUEST
        )
        mock_get_llm.return_value = (None, error_response)

        url = reverse("chat")
        data = {"messages": [{"role": "user", "content": "Test question"}]}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("app.chat.views.get_langchain_llm")
    @patch("app.chat.views.RagChatService")
    def test_chat_with_share_token(self, mock_service_class, mock_get_llm):
        """Test chat with share token"""

        # Use group owner's user for LLM
        mock_llm = MagicMock()
        mock_get_llm.return_value = (mock_llm, None)

        mock_service = MagicMock()
        mock_result = MagicMock()
        mock_result.llm_response.content = "Test response"
        mock_result.query_text = "Test question"
        mock_result.related_videos = None
        mock_service.run.return_value = mock_result
        mock_service_class.return_value = mock_service

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

    @patch("app.chat.views.get_langchain_llm")
    def test_chat_share_token_group_not_found(self, mock_get_llm):
        """Test chat with share token but group not found"""
        mock_llm = MagicMock()
        mock_get_llm.return_value = (mock_llm, None)

        url = reverse("chat")
        url += "?share_token=invalid-token"
        data = {
            "messages": [{"role": "user", "content": "Test question"}],
            "group_id": self.group.id,
        }

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("app.chat.views.get_langchain_llm")
    def test_chat_share_token_missing_group_id(self, mock_get_llm):
        """Test chat with share token but missing group_id"""
        mock_llm = MagicMock()
        mock_get_llm.return_value = (mock_llm, None)

        url = reverse("chat")
        url += f"?share_token={self.group.share_token}"
        data = {"messages": [{"role": "user", "content": "Test question"}]}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ChatFeedbackViewTests(APITestCase):
    """Tests for ChatFeedbackView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Generate share_token for testing
        share_token = secrets.token_urlsafe(32)
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
            share_token=share_token,
        )
        self.chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Test question",
            answer="Test answer",
        )

    def test_update_feedback_good(self):
        """Test updating feedback to good"""
        url = reverse("chat-feedback")
        data = {"chat_log_id": self.chat_log.id, "feedback": "good"}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.chat_log.refresh_from_db()
        self.assertEqual(self.chat_log.feedback, "good")

    def test_update_feedback_bad(self):
        """Test updating feedback to bad"""
        url = reverse("chat-feedback")
        data = {"chat_log_id": self.chat_log.id, "feedback": "bad"}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.chat_log.refresh_from_db()
        self.assertEqual(self.chat_log.feedback, "bad")

    def test_update_feedback_empty(self):
        """Test updating feedback to empty (None)"""
        self.chat_log.feedback = "good"
        self.chat_log.save()

        url = reverse("chat-feedback")
        data = {"chat_log_id": self.chat_log.id, "feedback": ""}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.chat_log.refresh_from_db()
        self.assertIsNone(self.chat_log.feedback)

    def test_update_feedback_missing_chat_log_id(self):
        """Test updating feedback without chat_log_id"""
        url = reverse("chat-feedback")
        data = {"feedback": "good"}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_feedback_invalid_feedback(self):
        """Test updating feedback with invalid value"""
        url = reverse("chat-feedback")
        data = {"chat_log_id": self.chat_log.id, "feedback": "invalid"}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_update_feedback_chat_log_not_found(self):
        """Test updating feedback for non-existent chat log"""
        url = reverse("chat-feedback")
        data = {"chat_log_id": 99999, "feedback": "good"}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_feedback_wrong_user(self):
        """Test updating feedback for chat log owned by different user"""
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )
        other_group = VideoGroup.objects.create(
            user=other_user, name="Other Group", description="Test"
        )
        other_chat_log = ChatLog.objects.create(
            user=other_user,
            group=other_group,
            question="Test question",
            answer="Test answer",
        )

        url = reverse("chat-feedback")
        data = {"chat_log_id": other_chat_log.id, "feedback": "good"}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_feedback_with_share_token(self):
        """Test updating feedback with share token"""
        # Don't force authenticate - use share token instead
        self.client.force_authenticate(user=None)
        url = reverse("chat-feedback")
        url += f"?share_token={self.group.share_token}"
        data = {"chat_log_id": self.chat_log.id, "feedback": "good"}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_update_feedback_share_token_mismatch(self):
        """Test updating feedback with wrong share token"""
        other_share_token = secrets.token_urlsafe(32)
        VideoGroup.objects.create(
            user=self.user,
            name="Other Group",
            description="Test",
            share_token=other_share_token,
        )

        url = reverse("chat-feedback")
        url += f"?share_token={other_share_token}"
        data = {"chat_log_id": self.chat_log.id, "feedback": "good"}

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ChatHistoryViewTests(APITestCase):
    """Tests for ChatHistoryView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        self.chat_log1 = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question 1",
            answer="Answer 1",
        )
        self.chat_log2 = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question 2",
            answer="Answer 2",
        )

    def test_get_chat_history(self):
        """Test getting chat history"""
        url = reverse("chat-history")
        url += f"?group_id={self.group.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_get_chat_history_missing_group_id(self):
        """Test getting chat history without group_id"""
        url = reverse("chat-history")

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_get_chat_history_group_not_found(self):
        """Test getting chat history for non-existent group"""
        url = reverse("chat-history")
        url += "?group_id=99999"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_get_chat_history_wrong_user(self):
        """Test getting chat history for group owned by different user"""
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )
        other_group = VideoGroup.objects.create(
            user=other_user, name="Other Group", description="Test"
        )

        url = reverse("chat-history")
        url += f"?group_id={other_group.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)


class ChatHistoryExportViewTests(APITestCase):
    """Tests for ChatHistoryExportView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        self.chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Test question",
            answer="Test answer",
            related_videos=[1, 2],
            feedback="good",
        )

    def test_export_chat_history(self):
        """Test exporting chat history as CSV"""
        url = reverse("chat-history-export")
        url += f"?group_id={self.group.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn("chat_history_group", response["Content-Disposition"])

        # Check CSV content
        content = response.content.decode("utf-8")
        self.assertIn("created_at", content)
        self.assertIn("Test question", content)
        self.assertIn("Test answer", content)

    def test_export_chat_history_missing_group_id(self):
        """Test exporting chat history without group_id"""
        url = reverse("chat-history-export")

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_export_chat_history_group_not_found(self):
        """Test exporting chat history for non-existent group"""
        url = reverse("chat-history-export")
        url += "?group_id=99999"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_export_chat_history_wrong_user(self):
        """Test exporting chat history for group owned by different user"""
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )
        other_group = VideoGroup.objects.create(
            user=other_user, name="Other Group", description="Test"
        )

        url = reverse("chat-history-export")
        url += f"?group_id={other_group.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class PopularScenesViewTests(APITestCase):
    """Tests for PopularScenesView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.video1 = Video.objects.create(
            user=self.user,
            title="Test Video 1",
            description="Test Description 1",
            status="completed",
        )
        self.video2 = Video.objects.create(
            user=self.user,
            title="Test Video 2",
            description="Test Description 2",
            status="completed",
        )

        share_token = secrets.token_urlsafe(32)
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
            share_token=share_token,
        )
        VideoGroupMember.objects.create(group=self.group, video=self.video1, order=0)
        VideoGroupMember.objects.create(group=self.group, video=self.video2, order=1)

        # Create chat logs with related_videos
        ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question 1",
            answer="Answer 1",
            related_videos=[
                {
                    "video_id": self.video1.id,
                    "title": "Test Video 1",
                    "start_time": "00:01:00",
                    "end_time": "00:02:00",
                },
                {
                    "video_id": self.video2.id,
                    "title": "Test Video 2",
                    "start_time": "00:03:00",
                    "end_time": "00:04:00",
                },
            ],
        )
        ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question 2",
            answer="Answer 2",
            related_videos=[
                {
                    "video_id": self.video1.id,
                    "title": "Test Video 1",
                    "start_time": "00:01:00",
                    "end_time": "00:02:00",
                },
            ],
        )
        ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question 3",
            answer="Answer 3",
            related_videos=[
                {
                    "video_id": self.video1.id,
                    "title": "Test Video 1",
                    "start_time": "00:01:00",
                    "end_time": "00:02:00",
                },
            ],
        )

    def test_get_popular_scenes(self):
        """Test getting popular scenes"""
        url = reverse("popular-scenes")
        url += f"?group_id={self.group.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        # Most referenced scene should be first
        self.assertEqual(response.data[0]["video_id"], self.video1.id)
        self.assertEqual(response.data[0]["start_time"], "00:01:00")
        self.assertEqual(response.data[0]["reference_count"], 3)
        # Second scene
        self.assertEqual(response.data[1]["video_id"], self.video2.id)
        self.assertEqual(response.data[1]["start_time"], "00:03:00")
        self.assertEqual(response.data[1]["reference_count"], 1)

    def test_get_popular_scenes_with_limit(self):
        """Test getting popular scenes with limit"""
        url = reverse("popular-scenes")
        url += f"?group_id={self.group.id}&limit=1"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["video_id"], self.video1.id)
        self.assertEqual(response.data[0]["reference_count"], 3)

    def test_get_popular_scenes_missing_group_id(self):
        """Test getting popular scenes without group_id"""
        url = reverse("popular-scenes")

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_popular_scenes_group_not_found(self):
        """Test getting popular scenes for non-existent group"""
        url = reverse("popular-scenes")
        url += "?group_id=99999"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_popular_scenes_wrong_user(self):
        """Test getting popular scenes for group owned by different user"""
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )
        other_group = VideoGroup.objects.create(
            user=other_user, name="Other Group", description="Test"
        )

        url = reverse("popular-scenes")
        url += f"?group_id={other_group.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_popular_scenes_with_share_token(self):
        """Test getting popular scenes with share token"""
        self.client.force_authenticate(user=None)
        url = reverse("popular-scenes")
        url += f"?group_id={self.group.id}&share_token={self.group.share_token}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_get_popular_scenes_invalid_share_token(self):
        """Test getting popular scenes with invalid share token"""
        self.client.force_authenticate(user=None)
        url = reverse("popular-scenes")
        url += f"?group_id={self.group.id}&share_token=invalid-token"

        response = self.client.get(url)

        # Invalid share token returns 401 (Unauthorized) not 404
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_popular_scenes_empty_chat_logs(self):
        """Test getting popular scenes when no chat logs exist"""
        empty_group = VideoGroup.objects.create(
            user=self.user, name="Empty Group", description="Test"
        )

        url = reverse("popular-scenes")
        url += f"?group_id={empty_group.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_get_popular_scenes_no_related_videos(self):
        """Test getting popular scenes when chat logs have no related_videos"""
        group_no_videos = VideoGroup.objects.create(
            user=self.user, name="No Videos Group", description="Test"
        )
        ChatLog.objects.create(
            user=self.user,
            group=group_no_videos,
            question="Question",
            answer="Answer",
            related_videos=[],
        )

        url = reverse("popular-scenes")
        url += f"?group_id={group_no_videos.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 0)

    def test_get_popular_scenes_includes_file_url(self):
        """Test that popular scenes include file URL"""
        url = reverse("popular-scenes")
        url += f"?group_id={self.group.id}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # file field should be present (may be None if no file uploaded)
        self.assertIn("file", response.data[0])
