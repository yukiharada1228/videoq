"""Tests for SubmitFeedbackUseCase."""

from datetime import datetime, timezone
import unittest

from app.domain.chat.entities import ChatLogEntity
from app.domain.chat.repositories import ChatRepository
from app.use_cases.chat.exceptions import (
    ChatNotFoundError,
    FeedbackPermissionDenied,
    InvalidFeedbackError,
)
from app.use_cases.chat.submit_feedback import SubmitFeedbackUseCase


class _StubChatRepository(ChatRepository):
    def __init__(self, log=None):
        self._log = log
        self.updated_feedback = None

    def get_logs_for_group(self, group_id: int, ascending: bool = True):
        raise NotImplementedError

    def create_log(self, user_id, group_id, question, answer, citations, is_shared):
        raise NotImplementedError

    def get_log_by_id(self, log_id: int):
        return self._log

    def update_feedback(self, log, feedback):
        self.updated_feedback = feedback
        log.feedback = feedback
        return log

    def get_logs_values_for_group(self, group_id: int):
        raise NotImplementedError

    def get_analytics_raw(self, group_id: int):
        raise NotImplementedError


class SubmitFeedbackUseCaseTests(unittest.TestCase):
    def _sample_log(self):
        return ChatLogEntity(
            id=1,
            user_id=10,
            group_id=20,
            group_user_id=10,
            group_share_token="share-abc",
            question="q",
            answer="a",
            is_shared_origin=False,
            feedback=None,
            created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )

    def test_execute_returns_feedback_result_dto(self):
        repo = _StubChatRepository(self._sample_log())
        use_case = SubmitFeedbackUseCase(repo)

        result = use_case.execute(chat_log_id=1, feedback="good", user_id=10)

        self.assertEqual(result.id, 1)
        self.assertEqual(result.feedback, "good")

    def test_execute_raises_invalid_feedback(self):
        repo = _StubChatRepository(self._sample_log())
        use_case = SubmitFeedbackUseCase(repo)

        with self.assertRaises(InvalidFeedbackError):
            use_case.execute(chat_log_id=1, feedback="excellent", user_id=10)

    def test_execute_raises_not_found(self):
        repo = _StubChatRepository(None)
        use_case = SubmitFeedbackUseCase(repo)

        with self.assertRaises(ChatNotFoundError):
            use_case.execute(chat_log_id=1, feedback="good", user_id=10)

    def test_execute_raises_permission_denied_for_wrong_owner(self):
        repo = _StubChatRepository(self._sample_log())
        use_case = SubmitFeedbackUseCase(repo)

        with self.assertRaises(FeedbackPermissionDenied):
            use_case.execute(chat_log_id=1, feedback="good", user_id=999)

    def test_execute_allows_share_token_access(self):
        repo = _StubChatRepository(self._sample_log())
        use_case = SubmitFeedbackUseCase(repo)

        result = use_case.execute(chat_log_id=1, feedback="bad", share_token="share-abc")

        self.assertEqual(result.feedback, "bad")
