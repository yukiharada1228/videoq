"""Shared token-counting helper for the agentic chat loop (§7.2).

This module is the single source of truth for token-based limits across the
agent (tool-result budget, transcript inline/truncation limits, history token
budget, etc.). Every limit expressed in tokens MUST go through
:func:`count_tokens` / :func:`truncate_to_tokens` so the accounting stays
consistent.

Tokens are counted with the ``o200k_base`` tiktoken encoding. The encoder is
resolved lazily and cached at module scope so it is built only once. If tiktoken
cannot load its encoding (e.g. offline with no cached vocab), the helpers fall
back to a coarse character-based heuristic and log a warning.
"""

import logging

import tiktoken

logger = logging.getLogger(__name__)

ENCODING_NAME = "o200k_base"
_TRUNCATION_SUFFIX = "…(truncated)"

# Sentinels for the lazily-resolved encoder cache. ``_encoder`` is ``None`` until
# resolved; ``_encoder_failed`` records that resolution failed so the fallback is
# used without re-attempting on every call.
_encoder = None
_encoder_failed = False


def _get_encoder():
    """Return the cached tiktoken encoder, or ``None`` if it could not load.

    The encoder is built once on first use via ``tiktoken.get_encoding`` and
    cached. ``tiktoken`` is referenced as a module attribute so tests can patch
    ``app.infrastructure.external.agentic.token_counter.tiktoken.get_encoding``
    to simulate the offline fallback path.

    Returns:
        The tiktoken ``Encoding`` instance, or ``None`` when loading failed.
    """
    global _encoder, _encoder_failed
    if _encoder is not None:
        return _encoder
    if _encoder_failed:
        return None
    try:
        _encoder = tiktoken.get_encoding(ENCODING_NAME)
    except Exception:  # pragma: no cover - exercised via patched get_encoding
        _encoder_failed = True
        logger.warning(
            "Failed to load tiktoken encoding '%s'; falling back to a "
            "character-based token estimate.",
            ENCODING_NAME,
            exc_info=True,
        )
        return None
    return _encoder


def count_tokens(text: str) -> int:
    """Count the number of tokens in ``text``.

    Args:
        text: The text to measure.

    Returns:
        The token count. Returns ``0`` for empty/falsy input. When the tiktoken
        encoder is unavailable, returns a coarse estimate of ``len(text) // 2``.
    """
    if not text:
        return 0
    encoder = _get_encoder()
    if encoder is None:
        return len(text) // 2
    return len(encoder.encode(text, disallowed_special=()))


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """Truncate ``text`` to at most ``max_tokens`` tokens (§7.3).

    Encodes the text, keeps the first ``max_tokens`` tokens, decodes back to a
    string, and appends a truncation marker when content was dropped. When the
    tiktoken encoder is unavailable, falls back to a character-based slice using
    the same ``2 chars ≈ 1 token`` heuristic as :func:`count_tokens`.

    Args:
        text: The text to truncate.
        max_tokens: Maximum number of tokens to retain. Non-positive values
            yield an empty string (or just the marker if input was non-empty).

    Returns:
        The (possibly truncated) text, with ``"…(truncated)"`` appended when it
        was cut.
    """
    if not text:
        return text
    if max_tokens <= 0:
        return _TRUNCATION_SUFFIX

    encoder = _get_encoder()
    if encoder is None:
        max_chars = max_tokens * 2
        if len(text) <= max_chars:
            return text
        return text[:max_chars] + _TRUNCATION_SUFFIX

    tokens = encoder.encode(text, disallowed_special=())
    if len(tokens) <= max_tokens:
        return text
    return encoder.decode(tokens[:max_tokens]) + _TRUNCATION_SUFFIX
