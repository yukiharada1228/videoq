"""Minimal read-only repository for fetching ChatLog data needed by evaluation."""


from app.infrastructure.models.chat import ChatLog


class _ChatLogForEvaluation:
    """Lightweight projection of ChatLog for evaluation use."""

    __slots__ = ("answer", "id", "question", "retrieved_contexts")

    def __init__(self, log: ChatLog):
        self.id = log.id
        self.question = log.question
        self.answer = log.answer
        self.retrieved_contexts = list(log.retrieved_contexts or [])


class DjangoChatLogForEvaluationRepository:
    """Fetches ChatLog data for the evaluation use case (no domain entity mapping needed)."""

    def get_by_id(self, chat_log_id: int) -> _ChatLogForEvaluation | None:
        log = ChatLog.objects.filter(id=chat_log_id).first()
        return _ChatLogForEvaluation(log) if log else None
