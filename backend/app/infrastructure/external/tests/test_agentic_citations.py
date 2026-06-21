"""Unit tests for the agentic citation pipeline (§11.6).

Covers two infrastructure-internal helpers used by the agentic chat gateway:

* :func:`parse_transcript_to_scenes` (``transcript_scene_parser``) — SRT vs.
  non-SRT input handling.
* :class:`CitationRegistry` (``citation_registry``) — turn-scoped registration,
  ``finalize`` renumbering, dedup, and reduction to the 4-field domain
  ``CitationDTO``.
"""

import dataclasses
from unittest import TestCase

from app.domain.chat.dtos import CitationDTO
from app.infrastructure.external.agentic.citation_registry import CitationRegistry
from app.infrastructure.external.agentic.scene_ref import SceneRef
from app.infrastructure.external.agentic.transcript_scene_parser import (
    parse_transcript_to_scenes,
)

# A valid multi-cue SRT blob with three well-formed blocks.
_VALID_SRT = (
    "1\n"
    "00:00:00,000 --> 00:00:02,500\n"
    "Hello world\n"
    "\n"
    "2\n"
    "00:00:02,500 --> 00:00:05,000\n"
    "Second cue\n"
    "\n"
    "3\n"
    "00:00:05,000 --> 00:00:07,250\n"
    "Third cue\n"
)


class ParseTranscriptToScenesTests(TestCase):
    """Tests for :func:`parse_transcript_to_scenes`."""

    def test_valid_multi_cue_srt_yields_one_sceneref_per_cue(self):
        scenes = parse_transcript_to_scenes(
            _VALID_SRT, video_id=42, video_title="Demo"
        )

        self.assertEqual(len(scenes), 3)
        for scene in scenes:
            self.assertIsInstance(scene, SceneRef)
            self.assertEqual(scene.video_id, 42)
            self.assertEqual(scene.video_title, "Demo")
            self.assertEqual(scene.source, "transcript")

        # Times are canonical SRT strings matching the source cues.
        self.assertEqual(scenes[0].start_time, "00:00:00,000")
        self.assertEqual(scenes[0].end_time, "00:00:02,500")
        self.assertEqual(scenes[1].start_time, "00:00:02,500")
        self.assertEqual(scenes[1].end_time, "00:00:05,000")
        self.assertEqual(scenes[2].start_time, "00:00:05,000")
        self.assertEqual(scenes[2].end_time, "00:00:07,250")

        # Numeric seconds parsed from the timestamps.
        self.assertAlmostEqual(scenes[0].start_sec, 0.0)
        self.assertAlmostEqual(scenes[0].end_sec, 2.5)
        self.assertAlmostEqual(scenes[1].start_sec, 2.5)
        self.assertAlmostEqual(scenes[1].end_sec, 5.0)
        self.assertAlmostEqual(scenes[2].start_sec, 5.0)
        self.assertAlmostEqual(scenes[2].end_sec, 7.25)

        # 0-based positional scene_index.
        self.assertEqual([s.scene_index for s in scenes], [0, 1, 2])

        # Cue text preserved.
        self.assertEqual(scenes[0].text, "Hello world")
        self.assertEqual(scenes[1].text, "Second cue")
        self.assertEqual(scenes[2].text, "Third cue")

    def test_non_srt_blob_yields_single_fallback_sceneref(self):
        blob = "This is just a plain paragraph of text, not SRT at all."

        scenes = parse_transcript_to_scenes(
            blob, video_id=7, video_title="Plain"
        )

        self.assertEqual(len(scenes), 1)
        scene = scenes[0]
        self.assertIsInstance(scene, SceneRef)
        self.assertEqual(scene.video_id, 7)
        self.assertEqual(scene.video_title, "Plain")
        self.assertEqual(scene.source, "transcript")
        self.assertIsNone(scene.start_time)
        self.assertIsNone(scene.end_time)
        self.assertIsNone(scene.start_sec)
        self.assertIsNone(scene.end_sec)
        self.assertIsNone(scene.scene_index)
        # Full text preserved verbatim.
        self.assertEqual(scene.text, blob)


def _make_scene(
    *,
    video_id: int,
    start_sec: float,
    start_time: str,
    end_time: str,
    text: str,
    title: str = "Vid",
) -> SceneRef:
    """Build a transcript ``SceneRef`` for registry tests."""
    return SceneRef(
        video_id=video_id,
        video_title=title,
        start_time=start_time,
        end_time=end_time,
        start_sec=start_sec,
        end_sec=start_sec + 1.0,
        scene_index=None,
        text=text,
        source="transcript",
    )


class CitationRegistryFinalizeTests(TestCase):
    """Tests for :meth:`CitationRegistry.finalize`."""

    def test_finalize_renumbers_and_reduces_cited_refs(self):
        registry = CitationRegistry()
        scene_a = _make_scene(
            video_id=1,
            start_sec=0.0,
            start_time="00:00:00,000",
            end_time="00:00:01,000",
            text="alpha context",
            title="First",
        )
        scene_b = _make_scene(
            video_id=2,
            start_sec=10.0,
            start_time="00:00:10,000",
            end_time="00:00:11,000",
            text="beta context",
            title="Second",
        )

        id_a = registry.register(scene_a)
        id_b = registry.register(scene_b)
        # Bodies reference the original (registry) ids, deliberately not 1/2.
        self.assertEqual(id_a, 1)
        self.assertEqual(id_b, 2)

        # Re-register with body tokens [3] and [7]: these stand in for the
        # appearance order in a body that cites the two registered refs out of
        # the registry's numbering. To exercise renumbering we register more
        # scenes so ids 3 and 7 exist.
        registry = CitationRegistry()
        # Register 7 scenes; only ids 3 and 7 are cited in the body.
        scenes = []
        for i in range(1, 8):
            scene = _make_scene(
                video_id=i,
                start_sec=float(i),
                start_time=f"00:00:0{i},000",
                end_time=f"00:00:0{i},500",
                text=f"context {i}",
                title=f"Title {i}",
            )
            scenes.append(scene)
            registry.register(scene)

        body, citations, retrieved_contexts = registry.finalize(
            "Intro [3] middle [7] end."
        )

        # [3] -> [1], [7] -> [2] in appearance order.
        self.assertEqual(body, "Intro [1] middle [2] end.")

        # Only the two cited refs survive, renumbered 1..2.
        self.assertEqual(len(citations), 2)
        self.assertEqual([c.video_id for c in citations], [3, 7])

        # retrieved_contexts mirror the surviving scenes' text, in order.
        self.assertEqual(retrieved_contexts, ["context 3", "context 7"])

    def test_finalize_excludes_refs_not_in_body(self):
        registry = CitationRegistry()
        scene_a = _make_scene(
            video_id=1,
            start_sec=0.0,
            start_time="00:00:00,000",
            end_time="00:00:01,000",
            text="cited",
        )
        scene_b = _make_scene(
            video_id=2,
            start_sec=5.0,
            start_time="00:00:05,000",
            end_time="00:00:06,000",
            text="uncited",
        )
        registry.register(scene_a)
        registry.register(scene_b)

        # Only the first registered ref ([1]) appears in the body.
        body, citations, retrieved_contexts = registry.finalize("Only [1] here.")

        self.assertEqual(body, "Only [1] here.")
        self.assertEqual(len(citations), 1)
        self.assertEqual(citations[0].video_id, 1)
        self.assertEqual(retrieved_contexts, ["cited"])

    def test_double_registering_same_scene_collapses_to_one_id(self):
        registry = CitationRegistry()
        scene = _make_scene(
            video_id=99,
            start_sec=3.0,
            start_time="00:00:03,000",
            end_time="00:00:04,000",
            text="dup",
        )
        # Distinct object, same (video_id, start_sec) key.
        scene_dup = _make_scene(
            video_id=99,
            start_sec=3.0,
            start_time="00:00:03,000",
            end_time="00:00:04,000",
            text="dup again",
        )

        first_id = registry.register(scene)
        second_id = registry.register(scene_dup)

        self.assertEqual(first_id, second_id)

        body, citations, retrieved_contexts = registry.finalize("See [1].")
        self.assertEqual(body, "See [1].")
        self.assertEqual(len(citations), 1)
        self.assertEqual(len(retrieved_contexts), 1)

    def test_reduced_citation_has_exactly_four_keys(self):
        registry = CitationRegistry()
        scene = _make_scene(
            video_id=5,
            start_sec=2.0,
            start_time="00:00:02,000",
            end_time="00:00:03,000",
            text="ctx",
            title="My Title",
        )
        registry.register(scene)

        _body, citations, _contexts = registry.finalize("Cite [1].")

        self.assertEqual(len(citations), 1)
        citation = citations[0]
        self.assertIsInstance(citation, CitationDTO)

        as_dict = dataclasses.asdict(citation)
        self.assertEqual(
            set(as_dict.keys()),
            {"video_id", "title", "start_time", "end_time"},
        )
        self.assertEqual(citation.video_id, 5)
        self.assertEqual(citation.title, "My Title")
        self.assertEqual(citation.start_time, "00:00:02,000")
        self.assertEqual(citation.end_time, "00:00:03,000")
