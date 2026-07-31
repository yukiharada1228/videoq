"""Abstract gateway interfaces for the evaluation domain."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EvaluationScores:
    """Scores returned by the RAG evaluation gateway."""

    faithfulness: float | None
    answer_relevancy: float | None
    context_precision: float | None


class RagEvaluationGateway(ABC):
    """Abstract interface for running RAGAS evaluation on a single Q&A turn."""

    @abstractmethod
    def evaluate(
        self,
        question: str,
        answer: str,
        retrieved_contexts: list[str],
    ) -> EvaluationScores:
        """
        Run RAGAS evaluation for a single Q&A sample.

        Args:
            question: The user's question.
            answer: The assistant's answer.
            retrieved_contexts: Raw text chunks retrieved by RAG.

        Returns:
            EvaluationScores with faithfulness, answer_relevancy, context_precision.
        """
        ...


class EvaluationTaskGateway(ABC):
    """Abstract interface for dispatching asynchronous evaluation work."""

    @abstractmethod
    def dispatch_evaluate_chat_log(self, chat_log_id: int) -> None:
        """Enqueue an asynchronous evaluation task for the given chat log."""
        ...
