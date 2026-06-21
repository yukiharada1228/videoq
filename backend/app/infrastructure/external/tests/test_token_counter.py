"""Tests for the agentic token-counting helper (§11.7).

Covers :func:`count_tokens` and :func:`truncate_to_tokens` from
``app.infrastructure.external.agentic.token_counter``: basic counting
semantics, the special-token regression (``disallowed_special=()``), the
character-based fallback when tiktoken cannot load its encoding, and
truncation behaviour for long and short input.
"""

from unittest.mock import patch

from django.test import TestCase

from app.infrastructure.external.agentic import token_counter
from app.infrastructure.external.agentic.token_counter import (
    count_tokens,
    truncate_to_tokens,
)


class CountTokensTests(TestCase):
    """Tests for :func:`count_tokens`."""

    def setUp(self):
        """Reset the module-level encoder cache before each test.

        The encoder is resolved lazily and cached at module scope, so tests
        that patch ``tiktoken.get_encoding`` must start from a clean cache to
        avoid leaking a previously-resolved (or failed) encoder.
        """
        token_counter._encoder = None
        token_counter._encoder_failed = False

    def tearDown(self):
        """Restore a clean encoder cache so other modules are unaffected."""
        token_counter._encoder = None
        token_counter._encoder_failed = False

    def test_empty_string_is_zero(self):
        """An empty string counts as zero tokens."""
        self.assertEqual(count_tokens(""), 0)

    def test_ascii_string_is_positive(self):
        """A non-empty ASCII string yields a positive token count."""
        self.assertGreater(count_tokens("hello world"), 0)

    def test_japanese_string_is_positive(self):
        """A non-empty Japanese string yields a positive token count."""
        self.assertGreater(count_tokens("こんにちは世界"), 0)

    def test_ascii_count_is_monotonic(self):
        """Adding ASCII characters does not decrease the token count."""
        short = count_tokens("hello")
        longer = count_tokens("hello world, this is a longer sentence")
        self.assertGreater(longer, short)

    def test_japanese_count_is_monotonic(self):
        """Adding Japanese characters does not decrease the token count."""
        short = count_tokens("こんにちは")
        longer = count_tokens("こんにちは、これはより長い日本語の文章です")
        self.assertGreater(longer, short)

    def test_special_token_string_does_not_raise(self):
        """Special-token-looking strings are encoded, not rejected.

        Regression for ``disallowed_special=()``: without it tiktoken raises
        on literal control strings like ``"<|endoftext|>"``.
        """
        for text in (
            "<|endoftext|>",
            "<|fim_prefix|>",
            "prefix <|endoftext|> suffix",
            "<|im_start|><|im_end|>",
        ):
            with self.subTest(text=text):
                self.assertGreater(count_tokens(text), 0)

    def test_fallback_uses_char_heuristic_and_warns(self):
        """When tiktoken fails to load, fall back to ``len(text) // 2``."""
        text = "abcdefghij"  # 10 chars -> 5 tokens via fallback heuristic
        with patch.object(
            token_counter.tiktoken,
            "get_encoding",
            side_effect=RuntimeError("no cached vocab"),
        ):
            with self.assertLogs(token_counter.logger, level="WARNING") as cm:
                result = count_tokens(text)

        self.assertEqual(result, len(text) // 2)
        self.assertTrue(
            any("falling back" in message.lower() for message in cm.output),
            cm.output,
        )

    def test_fallback_empty_string_is_zero(self):
        """The empty-string short-circuit applies even in fallback mode."""
        with patch.object(
            token_counter.tiktoken,
            "get_encoding",
            side_effect=RuntimeError("no cached vocab"),
        ):
            self.assertEqual(count_tokens(""), 0)


class TruncateToTokensTests(TestCase):
    """Tests for :func:`truncate_to_tokens`."""

    SUFFIX = "…(truncated)"

    def setUp(self):
        """Reset the module-level encoder cache before each test."""
        token_counter._encoder = None
        token_counter._encoder_failed = False

    def tearDown(self):
        """Restore a clean encoder cache so other modules are unaffected."""
        token_counter._encoder = None
        token_counter._encoder_failed = False

    def test_short_text_passes_through_unchanged(self):
        """Text within the token budget is returned verbatim."""
        text = "short text"
        result = truncate_to_tokens(text, max_tokens=1000)
        self.assertEqual(result, text)
        self.assertNotIn(self.SUFFIX, result)

    def test_long_text_is_truncated_and_marked(self):
        """Text over the budget is cut and marked as truncated."""
        text = "word " * 500
        max_tokens = 10
        result = truncate_to_tokens(text, max_tokens=max_tokens)

        self.assertTrue(result.endswith(self.SUFFIX))
        self.assertLess(len(result), len(text))
        # The retained content must fit the budget.
        retained = result[: -len(self.SUFFIX)]
        self.assertLessEqual(count_tokens(retained), max_tokens)

    def test_empty_text_passes_through(self):
        """Empty input is returned unchanged."""
        self.assertEqual(truncate_to_tokens("", max_tokens=10), "")

    def test_non_positive_budget_returns_marker(self):
        """A non-positive budget on non-empty text yields just the marker."""
        self.assertEqual(truncate_to_tokens("anything", max_tokens=0), self.SUFFIX)

    def test_fallback_truncates_long_text(self):
        """The character-based fallback truncates and marks long text."""
        text = "a" * 100
        max_tokens = 10  # max_chars == 20 via the 2-chars-per-token heuristic
        with patch.object(
            token_counter.tiktoken,
            "get_encoding",
            side_effect=RuntimeError("no cached vocab"),
        ):
            result = truncate_to_tokens(text, max_tokens=max_tokens)

        self.assertTrue(result.endswith(self.SUFFIX))
        self.assertEqual(result, "a" * (max_tokens * 2) + self.SUFFIX)

    def test_fallback_short_text_passes_through(self):
        """The fallback returns short text unchanged."""
        text = "abc"
        with patch.object(
            token_counter.tiktoken,
            "get_encoding",
            side_effect=RuntimeError("no cached vocab"),
        ):
            result = truncate_to_tokens(text, max_tokens=100)
        self.assertEqual(result, text)
