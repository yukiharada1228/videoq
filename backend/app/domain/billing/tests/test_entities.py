"""Unit tests for usage-limit domain entities."""

from unittest import TestCase

from app.domain.billing.entities import UserLimitsEntity


def _make_user_limits(**kwargs) -> UserLimitsEntity:
    defaults = {
        "user_id": 1,
        "storage_limit_gb": 50.0,
        "processing_limit_minutes": 600,
        "ai_answers_limit": 7000,
        "used_storage_bytes": 0,
        "used_processing_seconds": 0,
        "used_ai_answers": 0,
        "usage_period_start": None,
    }
    defaults.update(kwargs)
    return UserLimitsEntity(**defaults)  # type: ignore[arg-type]


class StorageLimitTests(TestCase):
    def test_storage_limit_uses_explicit_gb(self):
        sub = _make_user_limits(storage_limit_gb=12.5)
        expected = int(12.5 * 1024 ** 3)
        self.assertEqual(sub.get_storage_limit_bytes(), expected)

    def test_storage_limit_default(self):
        sub = _make_user_limits()
        self.assertEqual(sub.get_storage_limit_bytes(), 50 * 1024 ** 3)


class ProcessingLimitTests(TestCase):
    def test_processing_uses_explicit_minutes(self):
        sub = _make_user_limits(processing_limit_minutes=135)
        expected = 135 * 60
        self.assertEqual(sub.get_processing_limit_seconds(), expected)

    def test_processing_unlimited_with_none(self):
        sub = _make_user_limits(processing_limit_minutes=None)
        self.assertIsNone(sub.get_processing_limit_seconds())

    def test_processing_limit_default(self):
        sub = _make_user_limits()
        self.assertEqual(sub.get_processing_limit_seconds(), 600 * 60)


class AiAnswersLimitTests(TestCase):
    def test_ai_answers_uses_explicit_limit(self):
        sub = _make_user_limits(ai_answers_limit=1234)
        self.assertEqual(sub.get_ai_answers_limit(), 1234)

    def test_ai_answers_unlimited_with_none(self):
        sub = _make_user_limits(ai_answers_limit=None)
        self.assertIsNone(sub.get_ai_answers_limit())

    def test_ai_answers_default(self):
        sub = _make_user_limits()
        self.assertEqual(sub.get_ai_answers_limit(), 7000)


class CanUseStorageTests(TestCase):
    def test_can_use_storage_within_limit(self):
        limit_bytes = 50 * 1024 ** 3
        sub = _make_user_limits(used_storage_bytes=0)
        self.assertTrue(sub.can_use_storage(limit_bytes))

    def test_can_use_storage_exceeds_limit(self):
        limit_bytes = 50 * 1024 ** 3
        sub = _make_user_limits(used_storage_bytes=limit_bytes)
        self.assertFalse(sub.can_use_storage(1))

    def test_can_use_storage_exactly_at_limit(self):
        limit_bytes = 50 * 1024 ** 3
        sub = _make_user_limits(used_storage_bytes=0)
        self.assertTrue(sub.can_use_storage(limit_bytes))

    def test_can_use_storage_with_custom_limit(self):
        sub = _make_user_limits(storage_limit_gb=200.0)
        self.assertTrue(sub.can_use_storage(10 * 1024 ** 3))


class CanProcessTests(TestCase):
    def test_can_process_within_limit(self):
        sub = _make_user_limits(processing_limit_minutes=10, used_processing_seconds=0)
        self.assertTrue(sub.can_process(60))

    def test_can_process_exceeds_limit(self):
        limit_seconds = 10 * 60
        sub = _make_user_limits(processing_limit_minutes=10, used_processing_seconds=limit_seconds)
        self.assertFalse(sub.can_process(1))


class CanAnswerTests(TestCase):
    def test_can_answer_within_limit(self):
        sub = _make_user_limits(ai_answers_limit=500, used_ai_answers=0)
        self.assertTrue(sub.can_answer())

    def test_can_answer_at_limit(self):
        sub = _make_user_limits(ai_answers_limit=500, used_ai_answers=500)
        self.assertFalse(sub.can_answer())

    def test_can_answer_with_custom_limit(self):
        sub = _make_user_limits(ai_answers_limit=3000, used_ai_answers=2999)
        self.assertTrue(sub.can_answer())

    def test_can_answer_at_custom_limit(self):
        sub = _make_user_limits(ai_answers_limit=3000, used_ai_answers=3000)
        self.assertFalse(sub.can_answer())

    def test_can_answer_unlimited_with_none(self):
        sub = _make_user_limits(ai_answers_limit=None, used_ai_answers=999999)
        self.assertTrue(sub.can_answer())
