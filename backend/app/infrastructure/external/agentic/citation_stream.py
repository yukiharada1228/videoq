"""Live citation remapping for the streaming agentic gateway (§8.4, §8.5.6).

The agent loop streams the LLM's answer token-by-token. The model cites scenes
using the 1-based ``ref_id`` values it saw in the tool results, which accumulate
across multiple tool calls and can therefore exceed the number of *cited*
scenes (e.g. ``[6][7][9]``). The domain ``citations`` array, however, is
compacted to ``1..K`` in first-appearance order (the same reduction
:meth:`CitationRegistry.finalize` performs). If the streamed body keeps the raw
ref_ids while the citations array is compacted, the frontend ``[n]`` lookup
mismatches (some tokens resolve, others render as bare text).

:class:`StreamingCitationRemapper` rewrites ``[n]`` tokens *as they stream in*
so the emitted body uses the compacted first-appearance ordinals that line up
with the citations array, preserving token-by-token streaming. It is the
streaming-path equivalent of ``finalize`` and applies the same orphan-drop rule
(§8.5.6).
"""

import re
from typing import Dict, List

from app.infrastructure.external.agentic.citation_registry import CitationRegistry
from app.infrastructure.external.agentic.scene_ref import SceneRef

# A complete citation token such as ``[1]`` / ``[12]`` (§8.4).
_CITATION_TOKEN_RE = re.compile(r"\[(\d+)\]")


class StreamingCitationRemapper:
    """Rewrites LLM ``[n]`` citation tokens to compact first-appearance ordinals.

    As tokens stream in, raw registration-order ref_ids are remapped to compact
    ``1..K`` ordinals in order of first appearance, so the emitted body matches
    the compacted citations array (§8.4). Unknown/orphan refs are dropped
    entirely (§8.5.6). Tokens may be split across chunks (``"["``, ``"6"``,
    ``"]"``); the remapper buffers any text that could still be the start of an
    incomplete citation token and only emits text it is safe to commit.
    """

    def __init__(self, registry: CitationRegistry) -> None:
        """Initialise the remapper.

        Args:
            registry: The active turn :class:`CitationRegistry`; scenes are
                resolved via :meth:`CitationRegistry.scene_at`.
        """
        self._registry = registry
        self._buffer = ""
        # old ref_id -> new compact ordinal (1-based), first-appearance order.
        self._old_to_new: Dict[int, int] = {}
        # Cited scenes, in first-appearance order (== ordinal order).
        self._survivors: List[SceneRef] = []

    def feed(self, text_chunk: str) -> str:
        """Append a streamed chunk; return the SAFE-to-emit rewritten prefix.

        Buffers any trailing text that could still be part of an incomplete
        citation token (e.g. a dangling ``"["`` or ``"[12"`` with no closing
        ``"]"`` yet) so a token split across chunks is never emitted half-rendered.

        Args:
            text_chunk: The next streamed text fragment.

        Returns:
            The rewritten, safe-to-emit text (possibly ``""`` when everything is
            still buffered awaiting a token boundary).
        """
        self._buffer += text_chunk
        return self._consume(final=False)

    def flush(self) -> str:
        """Return any remaining buffered text, rewriting trailing complete tokens.

        A trailing unterminated ``"["`` or ``"[123"`` (no closing ``"]"``) is
        emitted verbatim since the stream has ended and it cannot complete.

        Returns:
            The remaining rewritten text.
        """
        return self._consume(final=True)

    def survivors(self) -> List[SceneRef]:
        """Scenes actually cited, in first-appearance order (== ordinal order)."""
        return list(self._survivors)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _consume(self, *, final: bool) -> str:
        """Drain the buffer, emitting everything that cannot be a partial token.

        Args:
            final: When ``True`` the stream has ended, so a trailing incomplete
                ``"["``-prefixed fragment is emitted verbatim instead of held back.

        Returns:
            The rewritten emittable text.
        """
        out: List[str] = []
        i = 0
        buf = self._buffer
        n = len(buf)

        while i < n:
            ch = buf[i]
            if ch != "[":
                out.append(ch)
                i += 1
                continue

            # ``[`` — could be a citation token, a non-citation bracket, or the
            # start of one of those split across chunks.
            j = i + 1
            # Scan contiguous digits after the bracket.
            while j < n and buf[j].isdigit():
                j += 1

            if j == i + 1:
                # ``[`` immediately followed by a non-digit (or buffer end).
                if j < n:
                    # Non-citation bracket (e.g. ``[note]`` or markdown link
                    # ``[text](url)``): emit the bracket verbatim and continue.
                    out.append("[")
                    i += 1
                    continue
                # ``[`` is the last char in the buffer: it might be a citation
                # whose digits arrive next chunk. Hold it unless this is flush.
                if final:
                    out.append("[")
                    i += 1
                    continue
                break  # keep ``[`` buffered for the next chunk.

            # ``[`` + one-or-more digits.
            if j < n and buf[j] == "]":
                # Complete token ``[<digits>]``.
                ref_id = int(buf[i + 1 : j])
                out.append(self._map_token(ref_id))
                i = j + 1
                continue

            if j < n:
                # Digits followed by a non-``]`` char: not a citation token.
                # Emit the bracket+digits verbatim, continue past them.
                out.append(buf[i:j])
                i = j
                continue

            # Digits run to the end of the buffer with no closing ``]`` yet.
            if final:
                # Stream ended: an unterminated ``[123`` is plain text.
                out.append(buf[i:j])
                i = j
                continue
            break  # keep ``[<digits>`` buffered for the next chunk.

        self._buffer = buf[i:]
        return "".join(out)

    def _map_token(self, ref_id: int) -> str:
        """Map a complete ``[ref_id]`` token to its compact ordinal (or drop it).

        Args:
            ref_id: The 1-based registration-order ref_id parsed from the body.

        Returns:
            ``"[<ordinal>]"`` for a valid (registered) ref, or ``""`` to drop an
            unknown/orphan ref entirely (§8.5.6).
        """
        existing = self._old_to_new.get(ref_id)
        if existing is not None:
            return f"[{existing}]"

        scene = self._registry.scene_at(ref_id)
        if scene is None:
            # Orphan/unknown ref: drop the token (matches finalize §8.5.6).
            return ""

        self._survivors.append(scene)
        ordinal = len(self._survivors)
        self._old_to_new[ref_id] = ordinal
        return f"[{ordinal}]"
