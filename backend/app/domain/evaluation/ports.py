"""Abstract repository interfaces for the evaluation domain."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional

from app.domain.evaluation.entities import ChatLogEvaluationEntity


class VideoGroupOwnershipPort(ABC):
    """Checks whether a video group belongs to a given user."""

    @abstractmethod
    def is_owner(self, group_id: int, user_id: int) -> bool:
        """Return True if the group exists and is owned by user_id."""
        ...


@dataclass
class EvaluationAggregateDTO:
    """Aggregated evaluation metrics for a group."""

    group_id: int
    evaluated_count: int
    avg_faithfulness: Optional[float]
    avg_answer_relevancy: Optional[float]
    avg_context_precision: Optional[float]


class EvaluationRepository(ABC):
    """Abstract interface for ChatLogEvaluation persistence."""

    @abstractmethod
    def save(self, evaluation: ChatLogEvaluationEntity) -> ChatLogEvaluationEntity:
        """Persist (create or update) an evaluation entity."""
        ...

    @abstractmethod
    def get_by_chat_log_id(self, chat_log_id: int) -> Optional[ChatLogEvaluationEntity]:
        """Return the evaluation for a given chat log, or None if not yet evaluated."""
        ...

    @abstractmethod
    def list_by_group_id(
        self,
        group_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ChatLogEvaluationEntity]:
        """Return paginated evaluations for all chat logs belonging to a group."""
        ...

    @abstractmethod
    def get_aggregate_by_group_id(self, group_id: int) -> EvaluationAggregateDTO:
        """Return averaged metrics for all completed evaluations in a group."""
        ...
