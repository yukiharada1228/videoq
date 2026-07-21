"""JSON salvage for truncated Stage2 payloads."""

from django.test import SimpleTestCase

from app.infrastructure.external.plog.extractor import _parse_json_content


class ExtractorJsonTests(SimpleTestCase):
    def test_parses_complete_object(self):
        data = _parse_json_content(
            '{"edges":[{"source":"A","target":"B","edge_type":"builds_on","quote":"q"}],'
            '"learning_objects":[{"concept":"A","opening_question":"?"}]}'
        )
        self.assertEqual(len(data["edges"]), 1)
        self.assertEqual(len(data["learning_objects"]), 1)

    def test_salvages_edges_from_truncated_learning_objects(self):
        truncated = """{
  "edges": [
    {
      "source": "ノットゲート",
      "target": "ノアゲート",
      "edge_type": "builds_on",
      "quote": "ノットとこうオアが組み合わさってこのノアになってる"
    }
  ],
  "learning_objects": [
    {
      "concept": "ノットゲート",
      "opening_question": "ノットゲートとは？",
      "hint_ladder": ["弱いヒント"
"""
        data = _parse_json_content(truncated)
        self.assertEqual(len(data.get("edges") or []), 1)
        self.assertEqual(data["edges"][0]["source"], "ノットゲート")
        self.assertNotIn("learning_objects", data)
