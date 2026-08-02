"""Domain entities for the evaluation domain."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class ChatLogEvaluationEntity:
    """Represents a RAGAS evaluation result for a single ChatLog entry."""

    id: int
    chat_log_id: int
    status: str  # pending | completed | failed
    faithfulness: float | None
    answer_relevancy: float | None
    context_precision: float | None
    error_message: str
    evaluated_at: datetime | None
    created_at: datetime
