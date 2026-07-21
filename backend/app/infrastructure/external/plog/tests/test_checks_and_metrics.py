"""Unit tests for PLOG deterministic checks and metrics."""

from django.test import SimpleTestCase

from app.domain.plog.gateways import ExtractedConcept, ExtractedEdge
from app.infrastructure.external.plog.checks import (
    apply_deterministic_checks,
    break_cycles,
    ordering_forms_dag,
    quote_occurs_in_transcript,
    topological_order,
)
from app.infrastructure.external.plog.metrics import (
    concept_coverage,
    direction_agreement_and_inversion,
    edge_prf,
    estimate_turn_cost_usd,
    is_dag,
    prerequisite_violation_rate,
    reveal_proxy,
    scaffold_features,
)


class PlogChecksTests(SimpleTestCase):
    def test_quote_match(self):
        transcript = "Today we introduce the decision boundary and then SVM."
        self.assertTrue(quote_occurs_in_transcript("decision boundary", transcript))
        self.assertFalse(quote_occurs_in_transcript("kernel trick magic", transcript))

    def test_quote_match_japanese_punctuation(self):
        transcript = "ここで、ノットゲートの動作を説明します。"
        self.assertTrue(
            quote_occurs_in_transcript("ここでノットゲートの動作を説明します", transcript)
        )

    def test_grounding_recovers_paraphrased_quote(self):
        """Paper §3.1(a): paraphrased quotes that are absent from the transcript are dropped."""
        concepts = [
            ExtractedConcept("クロック", 10.0),
            ExtractedConcept("ノットゲート", 40.0),
        ]
        edges = [
            ExtractedEdge(
                "クロック",
                "ノットゲート",
                "prerequisite_of",
                "the clock is needed before the not gate (paraphrase)",
            )
        ]
        transcript = "まずクロックとノットゲートの関係を確認します。"
        scenes = [
            {
                "text": "まずクロックとノットゲートの関係を確認します。",
                "start_sec": 10.0,
            },
        ]
        _, out = apply_deterministic_checks(concepts, edges, transcript, scenes)
        self.assertEqual(out, [])

    def test_keeps_transcript_grounded_quote_even_without_both_labels(self):
        """Paper §3.1(a) only requires the quote to occur in the transcript."""
        concepts = [
            ExtractedConcept("オアゲート", 10.0),
            ExtractedConcept("ノットゲート", 40.0),
        ]
        edges = [
            ExtractedEdge(
                "オアゲート",
                "ノットゲート",
                "builds_on",
                "回路1回目のレポート課題の回答をします",
            )
        ]
        transcript = "回路1回目のレポート課題の回答をします。オアゲートを説明します。"
        scenes = [
            {"text": "回路1回目のレポート課題の回答をします", "start_sec": 0.0},
        ]
        _, out = apply_deterministic_checks(concepts, edges, transcript, scenes)
        self.assertEqual(len(out), 1)

    def test_no_synthetic_ordering_path_when_stage2_empty(self):
        """Paper §3.1 does not synthesize a timeline DAG when Stage2 yields none."""
        concepts = [
            ExtractedConcept("概念A", 10.0, "object"),
            ExtractedConcept("概念B", 50.0, "object"),
            ExtractedConcept("概念C", 90.0, "object"),
        ]
        transcript = "概念Aと概念Bを説明します。概念Bと概念Cを説明します。"
        scenes = [
            {"text": "概念Aと概念Bを説明します。", "start_sec": 10.0},
            {"text": "概念Bと概念Cを説明します。", "start_sec": 50.0},
        ]
        _, out = apply_deterministic_checks(concepts, [], transcript, scenes)
        ordering = [e for e in out if e.edge_type in {"prerequisite_of", "builds_on"}]
        self.assertEqual(ordering, [])

    def test_break_cycles_legacy_helper(self):
        edges = [
            ExtractedEdge("A", "B", "builds_on", "quote about A to B that is long enough"),
            ExtractedEdge("B", "C", "builds_on", "quote about B to C that is long enough"),
            ExtractedEdge("C", "A", "builds_on", "quote about C to A that is long enough"),
        ]
        safe = break_cycles(edges)
        pairs = {(e.source_label, e.target_label) for e in safe}
        self.assertTrue(is_dag(pairs))
        self.assertLess(len(safe), 3)

    def test_automatic_checks_do_not_silently_drop_cycles(self):
        """Paper §4: cycle resolution is a human adjudication step."""
        concepts = [
            ExtractedConcept("A", 10.0),
            ExtractedConcept("B", 20.0),
            ExtractedConcept("C", 30.0),
        ]
        edges = [
            ExtractedEdge("A", "B", "builds_on", "quote about A to B that is long enough xx"),
            ExtractedEdge("B", "C", "builds_on", "quote about B to C that is long enough xx"),
            ExtractedEdge("C", "A", "builds_on", "quote about C to A that is long enough xx"),
        ]
        transcript = (
            "quote about A to B that is long enough xx "
            "quote about B to C that is long enough xx "
            "quote about C to A that is long enough xx"
        )
        _, out = apply_deterministic_checks(concepts, edges, transcript, [])
        self.assertEqual(len(out), 3)
        self.assertFalse(ordering_forms_dag(out))

    def test_apply_deterministic_checks_retypes_backfill(self):
        concepts = [
            ExtractedConcept("SVM", 100.0),
            ExtractedConcept("decision boundary", 20.0),
        ]
        edges = [
            ExtractedEdge(
                "SVM",
                "decision boundary",
                "builds_on",
                "we build from decision boundary toward SVM carefully",
            )
        ]
        transcript = "we build from decision boundary toward SVM carefully"
        scenes = [
            {"text": "decision boundary", "start_sec": 20.0},
            {"text": "SVM", "start_sec": 100.0},
        ]
        intro, out = apply_deterministic_checks(concepts, edges, transcript, scenes)
        self.assertEqual(intro["decision boundary"], 20.0)
        self.assertEqual(out[0].source_label, "SVM")
        self.assertEqual(out[0].target_label, "decision boundary")
        self.assertEqual(out[0].edge_type, "prerequisite_of")

    def test_topological_order(self):
        edges = [
            ExtractedEdge("A", "B", "prerequisite_of", "x"),
            ExtractedEdge("B", "C", "builds_on", "y"),
        ]
        order = topological_order(["C", "A", "B"], edges)
        self.assertEqual(order.index("A"), 0)
        self.assertLess(order.index("B"), order.index("C"))


class PlogMetricsTests(SimpleTestCase):
    def test_coverage_and_prf(self):
        gold_c = {"A", "B", "C"}
        ext_c = {"A", "B", "D"}
        self.assertAlmostEqual(concept_coverage(gold_c, ext_c), 2 / 3)
        gold_e = {("A", "B"), ("B", "C")}
        ext_e = {("A", "B"), ("A", "C")}
        p, r, f1 = edge_prf(gold_e, ext_e)
        self.assertAlmostEqual(p, 0.5)
        self.assertAlmostEqual(r, 0.5)

    def test_direction_and_cost(self):
        gold = {("A", "B"), ("B", "C")}
        ext = {("A", "B"), ("C", "B")}
        agree, inv = direction_agreement_and_inversion(gold, ext)
        self.assertGreater(agree, 0.0)
        self.assertGreater(inv, 0.0)
        cost = estimate_turn_cost_usd(
            fresh_input_tokens=100, cached_input_tokens=900, output_tokens=50
        )
        self.assertGreater(cost, 0.0)

    def test_pvr_and_reveal(self):
        responses = [
            {"mentioned": ["A", "B"], "introduced": ["A"]},
            {"mentioned": ["A"], "introduced": ["A", "B"]},
        ]
        self.assertAlmostEqual(prerequisite_violation_rate(responses), 0.5)
        self.assertTrue(reveal_proxy("The answer is margin maximization"))
        self.assertFalse(reveal_proxy("Which boundary looks better?"))
        feats = scaffold_features("What is X?", has_waypoint_citation=True)
        self.assertTrue(feats["asks_question"])
        self.assertTrue(feats["has_waypoint"])
