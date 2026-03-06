"""
Use case: Submit feedback for a chat log.
"""

from typing import Optional

from app.domain.chat.repositories import ChatRepository
from app.use_cases.chat.dto import ChatFeedbackResultDTO
from app.use_cases.chat.exceptions import (
    ChatNotFoundError,
    FeedbackPermissionDenied,
    InvalidFeedbackError,
)


class SubmitFeedbackUseCase:
    """Update the feedback (good/bad/None) on a chat log entry."""

    def __init__(self, chat_repo: ChatRepository):
        self.chat_repo = chat_repo

    def execute(
        self,
        chat_log_id: int,
        feedback: Optional[str],
        user_id: Optional[int] = None,
        share_token: Optional[str] = None,
    ) -> ChatFeedbackResultDTO:
        """
        Args:
            chat_log_id: ID of the ChatLog to update.
            feedback: "good", "bad", or None.
            user_id: ID of the requesting user (authenticated flow).
            share_token: Share token (shared access flow).

        Returns:
            ChatFeedbackResultDTO

        Raises:
            InvalidFeedbackError: If feedback is not one of "good", "bad", or None.
            ChatNotFoundError: If the chat log is not found.
            FeedbackPermissionDenied: If the caller lacks access.
        """
        if feedback not in {None, "good", "bad"}:
            raise InvalidFeedbackError("feedback must be 'good', 'bad', or null (unspecified)")

        log = self.chat_repo.get_log_by_id(chat_log_id)
        if log is None:
            raise ChatNotFoundError("Specified chat history not found")

        if share_token:
            if log.group_share_token != share_token:
                raise FeedbackPermissionDenied("Share token mismatch")
        else:
            if log.group_user_id != user_id:
                raise FeedbackPermissionDenied("No permission to access this history")

        updated = self.chat_repo.update_feedback(log, feedback)
        return ChatFeedbackResultDTO(id=updated.id, feedback=updated.feedback)
