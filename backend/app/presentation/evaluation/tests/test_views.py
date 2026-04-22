"""TDD tests for evaluation presentation views."""

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


class EvaluationSummaryViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="eval_view_user",
            email="eval_view@example.com",
            password="pass",
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch(_IS_OWNER, return_value=True)
    @patch(_SUMMARY_UC)
    def test_returns_summary_for_owned_group(self, mock_aggregate, _mock_owner):
        mock_aggregate.return_value = EvaluationAggregateDTO(
            group_id=self.group.id,
            evaluated_count=5,
            avg_faithfulness=0.85,
            avg_answer_relevancy=0.9,
            avg_context_precision=0.72,
        )

        url = reverse("evaluation-summary") + f"?group_id={self.group.id}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["group_id"], self.group.id)
        self.assertEqual(response.data["evaluated_count"], 5)
        self.assertAlmostEqual(response.data["avg_faithfulness"], 0.85)
        self.assertAlmostEqual(response.data["avg_answer_relevancy"], 0.9)
        self.assertAlmostEqual(response.data["avg_context_precision"], 0.72)

    def test_requires_group_id(self):
        url = reverse("evaluation-summary")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        url = reverse("evaluation-summary") + f"?group_id={self.group.id}"
        self.client.force_authenticate(user=None)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_404_for_other_users_group(self):
        other = User.objects.create_user(
            username="other_eval",
            email="other_eval@example.com",
            password="pass",
        )
        other_group = VideoGroup.objects.create(user=other, name="OG", description="")

        url = reverse("evaluation-summary") + f"?group_id={other_group.id}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class EvaluationLogsViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="eval_logs_user",
            email="eval_logs@example.com",
            password="pass",
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch(_IS_OWNER, return_value=True)
    @patch(_LIST_UC)
    def test_returns_evaluation_list_for_owned_group(self, mock_list, _mock_owner):
        mock_list.return_value = [_make_entity(1), _make_entity(2)]

        url = reverse("evaluation-logs") + f"?group_id={self.group.id}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]["chat_log_id"], 1)
        self.assertEqual(response.data[0]["status"], "completed")
        self.assertAlmostEqual(response.data[0]["faithfulness"], 0.9)

    def test_requires_group_id(self):
        url = reverse("evaluation-logs")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        url = reverse("evaluation-logs") + f"?group_id={self.group.id}"
        self.client.force_authenticate(user=None)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_404_for_other_users_group(self):
        other = User.objects.create_user(
            username="other_eval_logs",
            email="other_eval_logs@example.com",
            password="pass",
        )
        other_group = VideoGroup.objects.create(user=other, name="OG2", description="")

        url = reverse("evaluation-logs") + f"?group_id={other_group.id}"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
