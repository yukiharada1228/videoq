"""
Use case: Submit feedback for a chat log.
"""

from typing import Optional

from app.domain.chat.repositories import ChatRepository


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
    ):
        """
        Args:
            chat_log_id: ID of the ChatLog to update.
            feedback: "good", "bad", or None.
            user_id: ID of the requesting user (authenticated flow).
            share_token: Share token (shared access flow).

        Returns:
            Updated ChatLogEntity.

        Raises:
            ValueError: If the chat log is not found.
            PermissionError: If the caller lacks access.
        """
        log = self.chat_repo.get_log_by_id(chat_log_id)
        if log is None:
            raise ValueError("Specified chat history not found")

        if share_token:
            if log.group_share_token != share_token:
                raise PermissionError("Share token mismatch")
        else:
            if log.group_user_id != user_id:
                raise PermissionError("No permission to access this history")

        return self.chat_repo.update_feedback(log, feedback)
