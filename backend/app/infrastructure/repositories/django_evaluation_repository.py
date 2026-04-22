"""Django ORM implementation of EvaluationRepository."""

from typing import List, Optional

from django.db.models import Avg

from app.domain.evaluation.entities import ChatLogEvaluationEntity
from app.domain.evaluation.ports import EvaluationAggregateDTO, EvaluationRepository
from app.infrastructure.models.evaluation import ChatLogEvaluation


def _to_entity(obj: ChatLogEvaluation) -> ChatLogEvaluationEntity:
    return ChatLogEvaluationEntity(
        id=obj.id,
        chat_log_id=obj.chat_log_id,
        status=obj.status,
        faithfulness=obj.faithfulness,
        answer_relevancy=obj.answer_relevancy,
        context_precision=obj.context_precision,
        error_message=obj.error_message,
        evaluated_at=obj.evaluated_at,
        created_at=obj.created_at,
    )


class DjangoChatLogEvaluationRepository(EvaluationRepository):
    """Django ORM implementation of EvaluationRepository."""

    def save(self, evaluation: ChatLogEvaluationEntity) -> ChatLogEvaluationEntity:
        obj, _ = ChatLogEvaluation.objects.update_or_create(
            chat_log_id=evaluation.chat_log_id,
            defaults={
                "status": evaluation.status,
                "faithfulness": evaluation.faithfulness,
                "answer_relevancy": evaluation.answer_relevancy,
                "context_precision": evaluation.context_precision,
                "error_message": evaluation.error_message,
                "evaluated_at": evaluation.evaluated_at,
            },
        )
        return _to_entity(obj)

    def get_by_chat_log_id(self, chat_log_id: int) -> Optional[ChatLogEvaluationEntity]:
        obj = ChatLogEvaluation.objects.filter(chat_log_id=chat_log_id).first()
        return _to_entity(obj) if obj else None

    def list_by_group_id(
        self,
        group_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ChatLogEvaluationEntity]:
        qs = (
            ChatLogEvaluation.objects
            .filter(chat_log__group_id=group_id)
            .select_related("chat_log")
            .order_by("-chat_log__created_at")
        )
        return [_to_entity(obj) for obj in qs[offset : offset + limit]]

    def get_aggregate_by_group_id(self, group_id: int) -> EvaluationAggregateDTO:
        qs = ChatLogEvaluation.objects.filter(
            chat_log__group_id=group_id,
            status=ChatLogEvaluation.Status.COMPLETED,
        )
        count = qs.count()
        agg = qs.aggregate(
            avg_faithfulness=Avg("faithfulness"),
            avg_answer_relevancy=Avg("answer_relevancy"),
            avg_context_precision=Avg("context_precision"),
        )
        return EvaluationAggregateDTO(
            group_id=group_id,
            evaluated_count=count,
            avg_faithfulness=agg["avg_faithfulness"],
            avg_answer_relevancy=agg["avg_answer_relevancy"],
            avg_context_precision=agg["avg_context_precision"],
        )
