"""DTOs for evaluation use cases."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ChatLogEvaluationDTO:
    """Public DTO for a chat log evaluation result."""

    chat_log_id: int
    status: str
    faithfulness: Optional[float]
    answer_relevancy: Optional[float]
    context_precision: Optional[float]
    error_message: str
