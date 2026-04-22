"""Use case: evaluate a single ChatLog with RAGAS and persist the result."""

import logging
from datetime import datetime, timezone
from typing import Optional, Protocol, runtime_checkable

from app.domain.evaluation.entities import ChatLogEvaluationEntity
from app.domain.evaluation.gateways import RagEvaluationGateway
from app.domain.evaluation.ports import EvaluationRepository

logger = logging.getLogger(__name__)


@runtime_checkable
class _ChatLogRecord(Protocol):
    id: int
    question: str
    answer: str
    retrieved_contexts: list


class _ChatLogRepositoryProtocol(Protocol):
    def get_by_id(self, chat_log_id: int) -> Optional[_ChatLogRecord]:
        ...


class EvaluateChatLogUseCase:
    """
    Fetches a ChatLog by ID, runs RAGAS evaluation, and saves the result.

    On any failure the evaluation is persisted with status='failed' and the
    error message — the task never re-raises so the Celery worker does not retry.
    """

    def __init__(
        self,
        chat_log_repo: _ChatLogRepositoryProtocol,
        evaluation_repo: EvaluationRepository,
        evaluation_gateway: RagEvaluationGateway,
    ):
        self.chat_log_repo = chat_log_repo
        self.evaluation_repo = evaluation_repo
        self.evaluation_gateway = evaluation_gateway

    def execute(self, chat_log_id: int) -> None:
        pending = ChatLogEvaluationEntity(
            id=0,
            chat_log_id=chat_log_id,
            status="pending",
            faithfulness=None,
            answer_relevancy=None,
            context_precision=None,
            error_message="",
            evaluated_at=None,
            created_at=datetime.now(tz=timezone.utc),
        )

        chat_log = self.chat_log_repo.get_by_id(chat_log_id)
        if chat_log is None:
            # No FK exists → cannot persist. Log and return silently.
            logger.warning("ChatLog %s not found; skipping evaluation.", chat_log_id)
            pending.status = "failed"
            pending.error_message = f"ChatLog {chat_log_id} not found."
            return

        try:
            scores = self.evaluation_gateway.evaluate(
                question=chat_log.question,
                answer=chat_log.answer,
                retrieved_contexts=list(chat_log.retrieved_contexts or []),
            )
            pending.status = "completed"
            pending.faithfulness = scores.faithfulness
            pending.answer_relevancy = scores.answer_relevancy
            pending.context_precision = scores.context_precision
            pending.evaluated_at = datetime.now(tz=timezone.utc)
        except Exception as exc:
            logger.exception("RAGAS evaluation failed for ChatLog %s: %s", chat_log_id, exc)
            pending.status = "failed"
            pending.error_message = str(exc)

        self.evaluation_repo.save(pending)
