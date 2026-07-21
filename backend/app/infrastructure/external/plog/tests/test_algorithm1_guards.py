"""Algorithm-1 faithfulness helpers (grading / reveal guards)."""

from django.test import SimpleTestCase

from app.domain.plog.entities import PlogConceptEntity, PlogEdgeEntity, PlogGraphSnapshot
from app.infrastructure.external.plog.guided_gateway import (
    _graphs_have_ordering_path,
    _is_ask_for_answer,
    _is_meta_or_confused,
    _pregrade_reply,
    _should_stay_on_active,
)
from app.infrastructure.external.plog.runtime import (
    ordering_edges,
    ordering_path_ready,
    study_path_concept_ids,
)


class Algorithm1GuardTests(SimpleTestCase):
    def test_pregrade_only_forces_empty_and_ask_for_answer(self):
        self.assertEqual(_pregrade_reply(""), "miss")
        self.assertEqual(_pregrade_reply("教えて"), "miss")
        self.assertEqual(_pregrade_reply("関係なくない？"), "miss")
        self.assertEqual(_pregrade_reply("何を言っている？"), "miss")
        self.assertEqual(_pregrade_reply("？"), "miss")
        # Acknowledgements are left to GradeReply (paper: small-model grading).
        self.assertIsNone(_pregrade_reply("はい"))
        self.assertIsNone(_pregrade_reply("片方が1なら出力は1"))

    def test_ask_for_answer_detection(self):
        self.assertTrue(_is_ask_for_answer("教えて"))
        self.assertTrue(_is_ask_for_answer("答えを教えてください"))
        self.assertFalse(_is_ask_for_answer("ノットゲートは否定"))

    def test_stay_on_active_for_short_or_confused_replies(self):
        active = PlogConceptEntity(1, 1, "ノットゲート", "object", 1.0, embedding=[1.0, 0.0])
        other = PlogConceptEntity(2, 1, "Aに関係ない", "object", 2.0, embedding=[0.0, 1.0])
        routed = (0.9, PlogGraphSnapshot(1, [other], [], {}, [], "ready"), other)
        self.assertTrue(_is_meta_or_confused("関係なくない？"))
        self.assertTrue(
            _should_stay_on_active("関係なくない？", [1.0, 0.0], active, routed)
        )
        self.assertTrue(_should_stay_on_active("0は1", [1.0, 0.0], active, routed))
        # Clear longer topic switch with stronger match may leave active.
        self.assertFalse(
            _should_stay_on_active(
                "偶数と奇数の関係について詳しく知りたいです",
                [0.0, 1.0],
                active,
                routed,
            )
        )

    def test_study_path_empty_without_ordering_edges(self):
        concepts = [
            PlogConceptEntity(1, 1, "オア", "object", 1.0),
            PlogConceptEntity(2, 1, "ノット", "object", 2.0),
        ]
        self.assertEqual(study_path_concept_ids(concepts, []), [])

    def test_study_path_uses_ordering_dag_only(self):
        concepts = [
            PlogConceptEntity(1, 1, "オア", "object", 1.0),
            PlogConceptEntity(2, 1, "ノット", "object", 2.0),
            PlogConceptEntity(3, 1, "Z2の出力", "property", 9.0),
        ]
        edges = [
            PlogEdgeEntity(1, 1, 1, 2, "builds_on", "オアとノット"),
        ]
        path = study_path_concept_ids(concepts, edges)
        self.assertEqual(path, [1, 2])

    def test_study_mode_uses_existing_ordering_edges(self):
        concepts = [
            PlogConceptEntity(1, 1, "A", "object", 1.0),
            PlogConceptEntity(2, 1, "B", "object", 2.0),
            PlogConceptEntity(3, 1, "C", "object", 3.0),
        ]
        empty = PlogGraphSnapshot(
            video_id=1,
            concepts=concepts,
            edges=[],
            learning_objects={},
            summary_nodes=[],
            build_status="ready",
        )
        with_path = PlogGraphSnapshot(
            video_id=1,
            concepts=concepts,
            edges=[
                PlogEdgeEntity(1, 1, 1, 2, "builds_on", "quote"),
                PlogEdgeEntity(2, 1, 2, 3, "builds_on", "quote2"),
            ],
            learning_objects={},
            summary_nodes=[],
            build_status="ready",
        )
        self.assertFalse(ordering_path_ready(empty))
        self.assertTrue(ordering_path_ready(with_path))
        self.assertFalse(_graphs_have_ordering_path([empty]))
        self.assertTrue(_graphs_have_ordering_path([with_path]))
        self.assertEqual(len(ordering_edges(with_path.edges)), 2)
