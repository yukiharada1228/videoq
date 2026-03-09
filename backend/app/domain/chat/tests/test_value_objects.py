"""Unit tests for chat domain value objects."""

from unittest import TestCase

from app.domain.chat.exceptions import InvalidFeedbackValue
from app.domain.chat.value_objects import FeedbackValue


class FeedbackValueTests(TestCase):
    def test_normalize_optional_accepts_none(self):
        self.assertIsNone(FeedbackValue.normalize_optional(None))

    def test_normalize_optional_normalizes_case_and_whitespace(self):
        self.assertEqual(FeedbackValue.normalize_optional("  GOOD "), "good")
        self.assertEqual(FeedbackValue.normalize_optional("Bad"), "bad")

    def test_normalize_optional_rejects_invalid_value(self):
        with self.assertRaises(InvalidFeedbackValue):
            FeedbackValue.normalize_optional("excellent")

