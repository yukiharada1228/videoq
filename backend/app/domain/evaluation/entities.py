"""Domain entities for the evaluation domain."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class ChatLogEvaluationEntity:
    """Represents a RAGAS evaluation result for a single ChatLog entry."""

    id: int
    chat_log_id: int
    status: str  # pending | completed | failed
    faithfulness: Optional[float]
    answer_relevancy: Optional[float]
    context_precision: Optional[float]
    error_message: str
    evaluated_at: Optional[datetime]
    created_at: datetime
