"""Tests for exact-duplicate collapse (paper leaves broader merges to humans)."""

from django.test import SimpleTestCase

from app.domain.plog.entities import PlogConceptEntity
from app.domain.plog.gateways import ExtractedConcept
from app.infrastructure.external.plog.runtime import (
    covered_concept_ids,
    labels_near_duplicate,
    merge_near_duplicate_concepts,
    next_uncovered_in_order,
)


def _concept(cid: int, label: str, node_type: str = "object", intro: float = 0.0):
    return PlogConceptEntity(
        id=cid,
        video_id=1,
        label=label,
        node_type=node_type,
        intro_sec=intro,
    )


class ExactDuplicateHelpersTests(SimpleTestCase):
    def test_property_sibling_is_not_auto_merged(self):
        """Suffix twins need human adjudication — not automatic collapse."""
        self.assertFalse(labels_near_duplicate("ノットゲート", "ノットゲートの出力"))
        self.assertTrue(labels_near_duplicate("OR gate", "OR  gate"))

    def test_covered_is_reached_plus_exact_duplicates_only(self):
        concepts = {
            1: _concept(1, "ノットゲート"),
            2: _concept(2, "ノットゲートの出力", "property"),
            3: _concept(3, "ノットゲート"),  # exact duplicate label
        }
        covered = covered_concept_ids([1], concepts)
        self.assertEqual(covered, {1, 3})

    def test_next_uncovered_does_not_skip_property_siblings(self):
        concepts = {
            1: _concept(1, "ノットゲート", intro=1),
            2: _concept(2, "ノットゲートの出力", "property", intro=2),
            3: _concept(3, "オアゲート", intro=3),
        }
        nxt = next_uncovered_in_order([1, 2, 3], reached=[1], concepts_by_id=concepts)
        self.assertEqual(nxt, 2)

    def test_merge_collapses_exact_duplicates_only(self):
        merged = merge_near_duplicate_concepts(
            [
                ExtractedConcept("ノットゲート", 5.0, "object"),
                ExtractedConcept("ノットゲート", 5.0, "object"),
                ExtractedConcept("ノットゲートの出力", 90.0, "property"),
            ]
        )
        labels = [c.label for c in merged]
        self.assertEqual(labels.count("ノットゲート"), 1)
        self.assertIn("ノットゲートの出力", labels)
