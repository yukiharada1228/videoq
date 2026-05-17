"""
TDD tests for new REST URL patterns (issue #651).
These tests define the desired behavior for the refactored endpoints.
"""

import secrets

from django.apps import apps
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()
ChatLog = apps.get_model("app", "ChatLog")
VideoGroup = apps.get_model("app", "VideoGroup")


class ChatGroupHistoryViewTests(APITestCase):
    """Tests for GET/DELETE /api/chat/groups/{group_id}/history/"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="history_path_user",
            email="history_path@example.com",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="other_path_user",
            email="other_path@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
            share_slug=secrets.token_urlsafe(32),
        )

    def _create_chat_log(self, group=None):
        return ChatLog.objects.create(
            user=self.user,
            group=group or self.group,
            question="Q",
            answer="A",
            citations=[],
            retrieved_contexts=[],
        )

    def test_get_history_via_path_param_returns_200(self):
        """GET /api/chat/groups/{group_id}/history/ returns 200 with logs."""
        self._create_chat_log()
        url = reverse("chat-group-history", kwargs={"group_id": self.group.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_get_history_nonexistent_group_returns_404(self):
        url = reverse("chat-group-history", kwargs={"group_id": 99999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_history_other_users_group_returns_404(self):
        other_group = VideoGroup.objects.create(
            user=self.other_user,
            name="Other",
            share_slug=secrets.token_urlsafe(32),
        )
        url = reverse("chat-group-history", kwargs={"group_id": other_group.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_history_unauthenticated_returns_401(self):
        client = APIClient()
        url = reverse("chat-group-history", kwargs={"group_id": self.group.id})
        response = client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_delete_history_returns_204(self):
        """DELETE /api/chat/groups/{group_id}/history/ returns 204 No Content."""
        self._create_chat_log()
        self._create_chat_log()
        url = reverse("chat-group-history", kwargs={"group_id": self.group.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(ChatLog.objects.filter(group=self.group).count(), 0)

    def test_delete_history_nonexistent_group_returns_404(self):
        url = reverse("chat-group-history", kwargs={"group_id": 99999})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_history_other_users_group_returns_404(self):
        other_group = VideoGroup.objects.create(
            user=self.other_user,
            name="Other",
            share_slug=secrets.token_urlsafe(32),
        )
        url = reverse("chat-group-history", kwargs={"group_id": other_group.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_history_unauthenticated_returns_401(self):
        client = APIClient()
        url = reverse("chat-group-history", kwargs={"group_id": self.group.id})
        response = client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ChatLogFeedbackViewTests(APITestCase):
    """Tests for PATCH /api/chat/logs/{log_id}/feedback/"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="feedback_path_user",
            email="feedback_path@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
            share_slug=secrets.token_urlsafe(32),
        )
        self.log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Q",
            answer="A",
            citations=[],
            retrieved_contexts=[],
        )

    def test_patch_feedback_with_log_id_in_path_returns_200(self):
        """PATCH /api/chat/logs/{log_id}/feedback/ sets feedback and returns 200."""
        url = reverse("chat-log-feedback", kwargs={"log_id": self.log.id})
        response = self.client.patch(url, {"feedback": "good"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["feedback"], "good")
        self.assertEqual(response.data["chat_log_id"], self.log.id)

    def test_patch_feedback_clear_returns_200(self):
        """PATCH with feedback=null clears feedback."""
        url = reverse("chat-log-feedback", kwargs={"log_id": self.log.id})
        response = self.client.patch(url, {"feedback": None}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_feedback_nonexistent_log_returns_404(self):
        url = reverse("chat-log-feedback", kwargs={"log_id": 99999})
        response = self.client.patch(url, {"feedback": "good"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_feedback_with_share_slug_returns_200(self):
        """Share token users can also patch feedback."""
        client = APIClient()
        url = reverse("chat-log-feedback", kwargs={"log_id": self.log.id})
        url_with_share = f"{url}?share_slug={self.group.share_slug}"
        response = client.patch(url_with_share, {"feedback": "bad"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_feedback_unauthenticated_returns_401(self):
        client = APIClient()
        url = reverse("chat-log-feedback", kwargs={"log_id": self.log.id})
        response = client.patch(url, {"feedback": "good"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class ChatGroupAnalyticsViewTests(APITestCase):
    """Tests for GET /api/chat/groups/{group_id}/analytics/"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="analytics_path_user",
            email="analytics_path@example.com",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="analytics_other_user",
            email="analytics_other@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
            share_slug=secrets.token_urlsafe(32),
        )

    def test_get_analytics_via_path_param_returns_200(self):
        """GET /api/chat/groups/{group_id}/analytics/ returns 200."""
        url = reverse("chat-group-analytics", kwargs={"group_id": self.group.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("summary", response.data)
        self.assertIn("feedback", response.data)

    def test_get_analytics_nonexistent_group_returns_404(self):
        url = reverse("chat-group-analytics", kwargs={"group_id": 99999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_analytics_other_users_group_returns_404(self):
        other_group = VideoGroup.objects.create(
            user=self.other_user,
            name="Other",
            share_slug=secrets.token_urlsafe(32),
        )
        url = reverse("chat-group-analytics", kwargs={"group_id": other_group.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_analytics_unauthenticated_returns_401(self):
        client = APIClient()
        url = reverse("chat-group-analytics", kwargs={"group_id": self.group.id})
        response = client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
