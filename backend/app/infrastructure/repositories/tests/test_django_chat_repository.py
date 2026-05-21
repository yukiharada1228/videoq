"""Integration tests for DjangoChatRepository retrieved_contexts defer behaviour."""

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext

from app.infrastructure.models import VideoGroup
from app.infrastructure.models.chat import ChatLog
from app.infrastructure.repositories.django_chat_repository import DjangoChatRepository
from app.infrastructure.repositories.django_chat_log_for_evaluation_repository import (
    DjangoChatLogForEvaluationRepository,
)

User = get_user_model()


def _sql_selects_retrieved_contexts(queries) -> bool:
    return any("retrieved_contexts" in q["sql"] for q in queries)


class DjangoChatRepositoryRetrievedContextsTests(TestCase):
    """History/feedback methods must not load the retrieved_contexts column."""

    def setUp(self):
        self.repo = DjangoChatRepository()
        self.user = User.objects.create_user(
            username="chatuser",
            email="chat@example.com",
            password="pass",
        )
        self.group = VideoGroup.objects.create(
            user=self.user, name="G", description=""
        )
        self.log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Q",
            answer="A",
            retrieved_contexts=["ctx1", "ctx2", "ctx3"],
        )

    def test_get_logs_for_group_does_not_select_retrieved_contexts(self):
        with CaptureQueriesContext(connection) as ctx:
            self.repo.get_logs_for_group(self.group.id)

        self.assertFalse(
            _sql_selects_retrieved_contexts(ctx.captured_queries),
            "get_logs_for_group should not SELECT retrieved_contexts",
        )

    def test_get_log_by_id_does_not_select_retrieved_contexts(self):
        with CaptureQueriesContext(connection) as ctx:
            self.repo.get_log_by_id(self.log.id)

        self.assertFalse(
            _sql_selects_retrieved_contexts(ctx.captured_queries),
            "get_log_by_id should not SELECT retrieved_contexts",
        )

    def test_update_feedback_does_not_select_retrieved_contexts(self):
        from app.domain.chat.entities import ChatLogEntity
        log_entity = ChatLogEntity(
            id=self.log.id,
            user_id=self.user.id,
            group_id=self.group.id,
            group_user_id=self.user.id,
            group_share_token=None,
            question="Q",
            answer="A",
        )
        with CaptureQueriesContext(connection) as ctx:
            self.repo.update_feedback(log_entity, "good")

        self.assertFalse(
            _sql_selects_retrieved_contexts(ctx.captured_queries),
            "update_feedback re-fetch should not SELECT retrieved_contexts",
        )

    def test_get_logs_for_group_returns_empty_retrieved_contexts(self):
        logs = self.repo.get_logs_for_group(self.group.id)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].retrieved_contexts, [])

    def test_get_log_by_id_returns_empty_retrieved_contexts(self):
        log = self.repo.get_log_by_id(self.log.id)
        self.assertIsNotNone(log)
        self.assertEqual(log.retrieved_contexts, [])


class DjangoChatLogForEvaluationRepositoryTests(TestCase):
    """Evaluation repository must still load retrieved_contexts."""

    def setUp(self):
        self.repo = DjangoChatLogForEvaluationRepository()
        self.user = User.objects.create_user(
            username="evaluser",
            email="eval@example.com",
            password="pass",
        )
        self.group = VideoGroup.objects.create(
            user=self.user, name="G", description=""
        )
        self.log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Q",
            answer="A",
            retrieved_contexts=["ctx1", "ctx2"],
        )

    def test_get_by_id_reads_retrieved_contexts(self):
        result = self.repo.get_by_id(self.log.id)

        self.assertIsNotNone(result)
        self.assertEqual(result.retrieved_contexts, ["ctx1", "ctx2"])

    def test_get_by_id_selects_retrieved_contexts_in_sql(self):
        with CaptureQueriesContext(connection) as ctx:
            self.repo.get_by_id(self.log.id)

        self.assertTrue(
            _sql_selects_retrieved_contexts(ctx.captured_queries),
            "evaluation repo should SELECT retrieved_contexts",
        )
