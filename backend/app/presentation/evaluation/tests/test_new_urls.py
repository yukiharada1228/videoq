"""
TDD tests for new REST URL patterns in evaluation domain (issue #651).
"""

from datetime import datetime, timezone
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from app.domain.evaluation.entities import ChatLogEvaluationEntity
from app.domain.evaluation.ports import EvaluationAggregateDTO

User = get_user_model()
VideoGroup = apps.get_model("app", "VideoGroup")

_SUMMARY_UC = (
    "app.infrastructure.repositories.django_evaluation_repository"
    ".DjangoChatLogEvaluationRepository.get_aggregate_by_group_id"
)
_LIST_UC = (
    "app.infrastructure.repositories.django_evaluation_repository"
    ".DjangoChatLogEvaluationRepository.list_by_group_id"
)
_IS_OWNER = (
    "app.infrastructure.repositories.django_video_group_ownership_repository"
    ".DjangoVideoGroupOwnershipRepository.is_owner"
)


def _make_entity(chat_log_id: int) -> ChatLogEvaluationEntity:
    return ChatLogEvaluationEntity(
        id=chat_log_id,
        chat_log_id=chat_log_id,
        status="completed",
        faithfulness=0.9,
        answer_relevancy=0.85,
        context_precision=0.7,
        error_message="",
        evaluated_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )


class EvaluationGroupSummaryViewTests(TestCase):
    """Tests for GET /api/evaluation/groups/{group_id}/summary/"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="eval_group_summary_user",
            email="eval_group_summary@example.com",
            password="pass",
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch(_IS_OWNER, return_value=True)
    @patch(_SUMMARY_UC)
    def test_get_summary_via_path_param_returns_200(self, mock_aggregate, _mock_owner):
        """GET /api/evaluation/groups/{group_id}/summary/ returns 200."""
        mock_aggregate.return_value = EvaluationAggregateDTO(
            group_id=self.group.id,
            evaluated_count=3,
            avg_faithfulness=0.8,
            avg_answer_relevancy=0.9,
            avg_context_precision=0.7,
        )
        url = reverse("evaluation-group-summary", kwargs={"group_id": self.group.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["group_id"], self.group.id)
        self.assertEqual(response.data["evaluated_count"], 3)

    def test_get_summary_nonexistent_group_returns_404(self):
        url = reverse("evaluation-group-summary", kwargs={"group_id": 99999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_summary_unauthenticated_returns_401(self):
        client = APIClient()
        url = reverse("evaluation-group-summary", kwargs={"group_id": self.group.id})
        response = client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_old_query_param_url_no_longer_works(self):
        """Old URL name 'evaluation-summary' must be removed."""
        with self.assertRaises(Exception):
            reverse("evaluation-summary")

    def test_get_summary_other_users_group_returns_404(self):
        other = User.objects.create_user(
            username="eval_other_s",
            email="eval_other_s@example.com",
            password="pass",
        )
        other_group = VideoGroup.objects.create(user=other, name="OG", description="")
        url = reverse("evaluation-group-summary", kwargs={"group_id": other_group.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class EvaluationGroupLogsViewTests(TestCase):
    """Tests for GET /api/evaluation/groups/{group_id}/logs/"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="eval_group_logs_user",
            email="eval_group_logs@example.com",
            password="pass",
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch(_IS_OWNER, return_value=True)
    @patch(_LIST_UC)
    def test_get_logs_via_path_param_returns_200(self, mock_list, _mock_owner):
        """GET /api/evaluation/groups/{group_id}/logs/ returns 200."""
        mock_list.return_value = [_make_entity(1), _make_entity(2)]
        url = reverse("evaluation-group-logs", kwargs={"group_id": self.group.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_get_logs_nonexistent_group_returns_404(self):
        url = reverse("evaluation-group-logs", kwargs={"group_id": 99999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_logs_unauthenticated_returns_401(self):
        client = APIClient()
        url = reverse("evaluation-group-logs", kwargs={"group_id": self.group.id})
        response = client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_old_query_param_url_no_longer_works(self):
        """Old URL name 'evaluation-logs' must be removed."""
        with self.assertRaises(Exception):
            reverse("evaluation-logs")

    def test_get_logs_other_users_group_returns_404(self):
        other = User.objects.create_user(
            username="eval_other_l",
            email="eval_other_l@example.com",
            password="pass",
        )
        other_group = VideoGroup.objects.create(user=other, name="OG", description="")
        url = reverse("evaluation-group-logs", kwargs={"group_id": other_group.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
