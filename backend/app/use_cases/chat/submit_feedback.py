"""
Use case: Submit feedback for a chat log.
"""

from typing import Optional

from app.domain.chat.exceptions import (
    FeedbackAccessDenied as _DomainFeedbackAccessDenied,
    InvalidFeedbackValue as _DomainInvalidFeedbackValue,
)
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
        log = self.chat_repo.get_log_by_id(chat_log_id)
        if log is None:
            raise ChatNotFoundError("Specified chat history not found")

        try:
            planned_feedback = log.plan_feedback_update(
                feedback=feedback,
                user_id=user_id,
                share_token=share_token,
            )
        except _DomainInvalidFeedbackValue as e:
            raise InvalidFeedbackError(str(e)) from e
        except _DomainFeedbackAccessDenied as e:
            raise FeedbackPermissionDenied(str(e)) from e

        updated = self.chat_repo.update_feedback(log, planned_feedback)
        return ChatFeedbackResultDTO(id=updated.id, feedback=updated.feedback)
