"""TDD tests for evaluate_chat_log Celery task."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.entrypoints.tasks.evaluation import evaluate_chat_log
from app.infrastructure.models import ChatLog, ChatLogEvaluation

User = get_user_model()

_RAGAS_EVALUATE = (
    "app.infrastructure.evaluation.ragas_gateway.RagasEvaluationGateway.evaluate"
)


class EvaluateChatLogTaskTests(TestCase):
    def setUp(self):
        from django.apps import apps
        VideoGroup = apps.get_model("app", "VideoGroup")

        self.user = User.objects.create_user(
            username="eval_tester",
            email="eval@example.com",
            password="pass",
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")
        self.chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="What is RAG?",
            answer="RAG is a retrieval-augmented generation technique.",
            retrieved_contexts=["RAG combines retrieval and generation."],
        )

    @patch(_RAGAS_EVALUATE)
    def test_creates_completed_evaluation_on_success(self, mock_evaluate):
        from app.domain.evaluation.gateways import EvaluationScores
        mock_evaluate.return_value = EvaluationScores(
            faithfulness=0.9,
            answer_relevancy=0.85,
            context_precision=0.8,
        )

        evaluate_chat_log(self.chat_log.id)

        evaluation = ChatLogEvaluation.objects.get(chat_log=self.chat_log)
        self.assertEqual(evaluation.status, "completed")
        self.assertAlmostEqual(evaluation.faithfulness, 0.9)
        self.assertAlmostEqual(evaluation.answer_relevancy, 0.85)
        self.assertAlmostEqual(evaluation.context_precision, 0.8)
        self.assertEqual(evaluation.error_message, "")
        self.assertIsNotNone(evaluation.evaluated_at)

    @patch(_RAGAS_EVALUATE)
    def test_passes_chat_log_data_to_gateway(self, mock_evaluate):
        from app.domain.evaluation.gateways import EvaluationScores
        mock_evaluate.return_value = EvaluationScores(
            faithfulness=0.9,
            answer_relevancy=0.85,
            context_precision=0.8,
        )

        evaluate_chat_log(self.chat_log.id)

        mock_evaluate.assert_called_once_with(
            question="What is RAG?",
            answer="RAG is a retrieval-augmented generation technique.",
            retrieved_contexts=["RAG combines retrieval and generation."],
        )

    def test_does_not_raise_when_chat_log_missing(self):
        # FK constraint prevents persisting an evaluation for a non-existent ChatLog.
        # The use case must handle this gracefully without raising.
        try:
            evaluate_chat_log(chat_log_id=99999)
        except Exception as exc:
            self.fail(f"evaluate_chat_log raised for missing ChatLog: {exc}")

    @patch(_RAGAS_EVALUATE)
    def test_creates_failed_evaluation_when_gateway_raises(self, mock_evaluate):
        mock_evaluate.side_effect = RuntimeError("ragas connection error")

        evaluate_chat_log(self.chat_log.id)

        evaluation = ChatLogEvaluation.objects.get(chat_log=self.chat_log)
        self.assertEqual(evaluation.status, "failed")
        self.assertIn("ragas connection error", evaluation.error_message)

    @patch(_RAGAS_EVALUATE)
    def test_does_not_raise_on_failure(self, mock_evaluate):
        mock_evaluate.side_effect = Exception("unexpected error")

        # Should not raise — Celery task must handle errors gracefully
        try:
            evaluate_chat_log(self.chat_log.id)
        except Exception as exc:
            self.fail(f"evaluate_chat_log raised unexpectedly: {exc}")
