"""Unit tests for chat domain entities."""

from datetime import datetime, timezone
from unittest import TestCase

from app.domain.chat.entities import ChatLogEntity
from app.domain.chat.exceptions import FeedbackAccessDenied, InvalidFeedbackValue


class ChatLogEntityTests(TestCase):
    def _sample_log(self) -> ChatLogEntity:
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

    def test_validate_feedback_value_raises_for_invalid_input(self):
        with self.assertRaises(InvalidFeedbackValue):
            ChatLogEntity.validate_feedback_value("excellent")

    def test_assert_feedback_access_allows_owner(self):
        log = self._sample_log()
        log.assert_feedback_access(user_id=10)

    def test_assert_feedback_access_allows_matching_share_token(self):
        log = self._sample_log()
        log.assert_feedback_access(share_token="share-abc")

    def test_assert_feedback_access_raises_for_wrong_owner(self):
        log = self._sample_log()
        with self.assertRaises(FeedbackAccessDenied):
            log.assert_feedback_access(user_id=999)

    def test_plan_feedback_update_validates_and_returns_value(self):
        log = self._sample_log()
        planned = log.plan_feedback_update(feedback="good", user_id=10)
        self.assertEqual(planned, "good")

    def test_plan_feedback_update_normalizes_feedback(self):
        log = self._sample_log()
        planned = log.plan_feedback_update(feedback="  GOOD  ", user_id=10)
        self.assertEqual(planned, "good")

    def test_plan_feedback_update_raises_for_invalid_value(self):
        log = self._sample_log()
        with self.assertRaises(InvalidFeedbackValue):
            log.plan_feedback_update(feedback="excellent", user_id=10)
