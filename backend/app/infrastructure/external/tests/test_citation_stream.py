"""Unit tests for :class:`StreamingCitationRemapper` (§8.4, §8.5.6).

The streaming agentic path rewrites the LLM's raw registration-order ``[ref_id]``
tokens into compact first-appearance ordinals ``1..K`` as they stream in, so the
emitted body lines up with the compacted ``citations`` array the frontend keys by
id. These tests pin that behaviour directly against a real
:class:`CitationRegistry` (no Django / DB needed).

Covered:

* first-appearance ordinal assignment with dedup of a repeated ref (single chunk);
* a token split across chunks (``"["`` / ``"2"`` / ``"]"``) round-trips correctly;
* an unknown/orphan ref is dropped entirely (§8.5.6);
* a non-citation bracket (markdown link) is preserved verbatim;
* a trailing unterminated ``"["`` is emitted verbatim at flush.
"""

import unittest

from app.infrastructure.external.agentic.citation_registry import CitationRegistry
from app.infrastructure.external.agentic.citation_stream import (
    StreamingCitationRemapper,
)
from app.infrastructure.external.agentic.scene_ref import SceneRef


def _scene(i: int) -> SceneRef:
    """Build a distinct registered scene for ref_id ``i`` (1-based)."""
    return SceneRef(
        video_id=i,
        video_title=f"Video {i}",
        start_time=f"00:00:0{i},000",
        end_time=f"00:00:1{i},000",
        start_sec=float(i),
        end_sec=float(i + 1),
        scene_index=0,
        text=f"scene text {i}",
        source="vector",
    )


def _registry(n: int) -> CitationRegistry:
    """A registry with ``n`` distinct scenes registered as ref_ids ``1..n``."""
    registry = CitationRegistry()
    for i in range(1, n + 1):
        registry.register(_scene(i))
    return registry


class StreamingCitationRemapperTests(unittest.TestCase):
    """Live remapping of ``[n]`` tokens to compact first-appearance ordinals."""

    def test_single_chunk_first_appearance_ordinals_with_dedup(self):
        """One chunk: refs renumber by first appearance; repeated ref reuses id."""
        registry = _registry(3)
        remapper = StreamingCitationRemapper(registry)

        emitted = remapper.feed("see [2] and [1] and [2]") + remapper.flush()

        # [2] -> [1] (first seen), [1] -> [2] (second seen), repeated [2] -> [1].
        self.assertEqual(emitted, "see [1] and [2] and [1]")

        survivors = remapper.survivors()
        self.assertEqual(len(survivors), 2)
        # First-appearance order == ordinal order: ref 2 then ref 1.
        self.assertEqual([s.video_id for s in survivors], [2, 1])

    def test_token_split_across_chunks(self):
        """A ``[2]`` split into three chunks still emits a single ``[1]`` token."""
        registry = _registry(3)
        remapper = StreamingCitationRemapper(registry)

        parts = [
            remapper.feed("see ["),
            remapper.feed("2"),
            remapper.feed("] end"),
            remapper.flush(),
        ]
        # Nothing dangling is emitted mid-token; concatenation is well-formed.
        self.assertEqual("".join(parts), "see [1] end")
        self.assertEqual([s.video_id for s in remapper.survivors()], [2])

    def test_unknown_ref_is_dropped(self):
        """An orphan ref (not registered) is removed from the body (§8.5.6)."""
        registry = _registry(2)
        remapper = StreamingCitationRemapper(registry)

        emitted = remapper.feed("a [9] b") + remapper.flush()

        # The whole ``[9]`` token is dropped, leaving the surrounding spaces.
        self.assertEqual(emitted, "a  b")
        self.assertEqual(remapper.survivors(), [])

    def test_non_citation_bracket_preserved(self):
        """A markdown-style ``[text](url)`` bracket is emitted unchanged."""
        registry = _registry(2)
        remapper = StreamingCitationRemapper(registry)

        emitted = remapper.feed("link [text](url)") + remapper.flush()

        self.assertEqual(emitted, "link [text](url)")
        self.assertEqual(remapper.survivors(), [])

    def test_trailing_unterminated_bracket_emitted_at_flush(self):
        """A dangling ``"["`` at end-of-stream is emitted verbatim by flush."""
        registry = _registry(1)
        remapper = StreamingCitationRemapper(registry)

        fed = remapper.feed("end [")
        # The lone ``[`` is buffered (could begin a token), not emitted yet.
        self.assertEqual(fed, "end ")
        # Flush releases it verbatim since the stream cannot complete it.
        self.assertEqual(remapper.flush(), "[")


if __name__ == "__main__":
    unittest.main()
