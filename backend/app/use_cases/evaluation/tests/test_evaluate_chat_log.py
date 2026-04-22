"""TDD tests for EvaluateChatLogUseCase."""

import unittest
from typing import List, Optional

from app.domain.evaluation.entities import ChatLogEvaluationEntity
from app.domain.evaluation.gateways import EvaluationScores, RagEvaluationGateway
from app.domain.evaluation.ports import EvaluationAggregateDTO, EvaluationRepository
from app.use_cases.evaluation.evaluate_chat_log import EvaluateChatLogUseCase


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeChatLogRecord:
    """Minimal record returned by FakeChatLogRepository."""

    def __init__(self, id: int, question: str, answer: str, retrieved_contexts: List[str]):
        self.id = id
        self.question = question
        self.answer = answer
        self.retrieved_contexts = retrieved_contexts


class _FakeChatLogRepository:
    def __init__(self, log: Optional[_FakeChatLogRecord] = None):
        self._log = log

    def get_by_id(self, chat_log_id: int) -> Optional[_FakeChatLogRecord]:
        if self._log and self._log.id == chat_log_id:
            return self._log
        return None


class _FakeEvaluationRepository(EvaluationRepository):
    def __init__(self):
        self.saved: List[ChatLogEvaluationEntity] = []

    def save(self, evaluation: ChatLogEvaluationEntity) -> ChatLogEvaluationEntity:
        # Assign a fake ID on first save
        if evaluation.id == 0:
            evaluation.id = len(self.saved) + 1
        # Upsert by chat_log_id
        existing = next((e for e in self.saved if e.chat_log_id == evaluation.chat_log_id), None)
        if existing:
            self.saved.remove(existing)
        self.saved.append(evaluation)
        return evaluation

    def get_by_chat_log_id(self, chat_log_id: int) -> Optional[ChatLogEvaluationEntity]:
        return next((e for e in self.saved if e.chat_log_id == chat_log_id), None)

    def list_by_group_id(
        self,
        group_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ChatLogEvaluationEntity]:
        return []

    def get_aggregate_by_group_id(self, group_id: int) -> EvaluationAggregateDTO:
        return EvaluationAggregateDTO(
            group_id=group_id,
            evaluated_count=0,
            avg_faithfulness=None,
            avg_answer_relevancy=None,
            avg_context_precision=None,
        )


class _FakeRagEvaluationGateway(RagEvaluationGateway):
    def __init__(self, scores: EvaluationScores, error: Optional[Exception] = None):
        self.scores = scores
        self.error = error
        self.calls: List[tuple[str, str, List[str]]] = []

    def evaluate(self, question: str, answer: str, retrieved_contexts: List[str]) -> EvaluationScores:
        self.calls.append((question, answer, retrieved_contexts))
        if self.error:
            raise self.error
        return self.scores


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class EvaluateChatLogUseCaseTests(unittest.TestCase):
    def _make_use_case(self, log=None, scores=None, gateway_error=None):
        scores = scores or EvaluationScores(
            faithfulness=0.9,
            answer_relevancy=0.85,
            context_precision=0.7,
        )
        return (
            EvaluateChatLogUseCase(
                chat_log_repo=_FakeChatLogRepository(log),
                evaluation_repo=_FakeEvaluationRepository(),
                evaluation_gateway=_FakeRagEvaluationGateway(scores, error=gateway_error),
            ),
        )

    def _make_uc_with_repos(self, log=None, scores=None, gateway_error=None):
        scores = scores or EvaluationScores(
            faithfulness=0.9,
            answer_relevancy=0.85,
            context_precision=0.7,
        )
        eval_repo = _FakeEvaluationRepository()
        gateway = _FakeRagEvaluationGateway(scores, error=gateway_error)
        uc = EvaluateChatLogUseCase(
            chat_log_repo=_FakeChatLogRepository(log),
            evaluation_repo=eval_repo,
            evaluation_gateway=gateway,
        )
        return uc, eval_repo, gateway

    def test_saves_completed_evaluation_with_scores(self):
        log = _FakeChatLogRecord(
            id=1,
            question="What is RAG?",
            answer="RAG stands for Retrieval-Augmented Generation.",
            retrieved_contexts=["RAG is a technique that combines retrieval and generation."],
        )
        scores = EvaluationScores(faithfulness=0.9, answer_relevancy=0.8, context_precision=0.75)
        uc, eval_repo, gateway = self._make_uc_with_repos(log=log, scores=scores)

        uc.execute(chat_log_id=1)

        saved = eval_repo.get_by_chat_log_id(1)
        self.assertIsNotNone(saved)
        self.assertEqual(saved.status, "completed")
        self.assertAlmostEqual(saved.faithfulness, 0.9)
        self.assertAlmostEqual(saved.answer_relevancy, 0.8)
        self.assertAlmostEqual(saved.context_precision, 0.75)
        self.assertEqual(saved.error_message, "")
        self.assertIsNotNone(saved.evaluated_at)

    def test_passes_correct_inputs_to_gateway(self):
        log = _FakeChatLogRecord(
            id=42,
            question="How does vector search work?",
            answer="Vector search uses embeddings.",
            retrieved_contexts=["Embeddings are numerical representations.", "FAISS is a library."],
        )
        uc, _, gateway = self._make_uc_with_repos(log=log)

        uc.execute(chat_log_id=42)

        self.assertEqual(len(gateway.calls), 1)
        question, answer, contexts = gateway.calls[0]
        self.assertEqual(question, "How does vector search work?")
        self.assertEqual(answer, "Vector search uses embeddings.")
        self.assertEqual(contexts, ["Embeddings are numerical representations.", "FAISS is a library."])

    def test_does_not_raise_when_chat_log_not_found(self):
        uc, eval_repo, _ = self._make_uc_with_repos(log=None)

        try:
            uc.execute(chat_log_id=999)
        except Exception as exc:
            self.fail(f"execute raised for missing ChatLog: {exc}")

    def test_marks_failed_when_gateway_raises(self):
        log = _FakeChatLogRecord(
            id=5,
            question="q",
            answer="a",
            retrieved_contexts=["ctx"],
        )
        uc, eval_repo, _ = self._make_uc_with_repos(
            log=log,
            gateway_error=RuntimeError("ragas is not installed"),
        )

        uc.execute(chat_log_id=5)

        saved = eval_repo.get_by_chat_log_id(5)
        self.assertEqual(saved.status, "failed")
        self.assertIn("ragas is not installed", saved.error_message)

    def test_handles_none_scores_gracefully(self):
        log = _FakeChatLogRecord(
            id=7,
            question="q",
            answer="a",
            retrieved_contexts=[],
        )
        scores = EvaluationScores(faithfulness=None, answer_relevancy=None, context_precision=None)
        uc, eval_repo, _ = self._make_uc_with_repos(log=log, scores=scores)

        uc.execute(chat_log_id=7)

        saved = eval_repo.get_by_chat_log_id(7)
        self.assertEqual(saved.status, "completed")
        self.assertIsNone(saved.faithfulness)
        self.assertIsNone(saved.answer_relevancy)
        self.assertIsNone(saved.context_precision)
