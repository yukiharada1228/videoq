"""Unit tests for JanomeNltkKeywordExtractor."""

from unittest import TestCase

from app.infrastructure.chat.keyword_extractor import JanomeNltkKeywordExtractor


class JanomeNltkKeywordExtractorJapaneseTests(TestCase):
    def setUp(self):
        self.extractor = JanomeNltkKeywordExtractor()

    def test_extracts_japanese_nouns_from_single_question(self):
        # janome splits "機械学習" into "機械" + "学習"
        results = self.extractor.extract(["機械学習の特徴は何ですか"])
        words = [r.word for r in results]
        self.assertIn("機械", words)
        self.assertIn("学習", words)
        self.assertIn("特徴", words)

    def test_excludes_single_character_ja_tokens(self):
        results = self.extractor.extract(["日本語の学習"])
        words = [r.word for r in results]
        for word in words:
            self.assertGreaterEqual(len(word), 2)

    def test_counts_are_aggregated_across_questions(self):
        # janome splits "機械学習" into "機械" + "学習"; each appears in both questions
        results = self.extractor.extract(["機械学習の特徴", "機械学習の課題"])
        count_map = {r.word: r.count for r in results}
        self.assertEqual(count_map.get("学習"), 2)

    def test_results_are_sorted_by_frequency_descending(self):
        # "学習" appears 3 times, "特徴" 2 times
        results = self.extractor.extract(["機械学習の特徴", "機械学習の課題", "深層学習の特徴"])
        if len(results) >= 2:
            for i in range(len(results) - 1):
                self.assertGreaterEqual(results[i].count, results[i + 1].count)

    def test_limit_caps_number_of_results(self):
        questions = ["機械学習の特徴は何ですか。深層学習との違いを教えてください。"]
        results = self.extractor.extract(questions, limit=1)
        self.assertLessEqual(len(results), 1)

    def test_empty_input_returns_empty_list(self):
        results = self.extractor.extract([])
        self.assertEqual(results, [])


class JanomeNltkKeywordExtractorEnglishTests(TestCase):
    def setUp(self):
        self.extractor = JanomeNltkKeywordExtractor()

    def test_extracts_english_nouns_from_question(self):
        results = self.extractor.extract(["What are the features of machine learning?"])
        words = [r.word for r in results]
        self.assertTrue(any(w in words for w in ["features", "machine", "learning"]))

    def test_excludes_short_english_tokens(self):
        results = self.extractor.extract(["What is AI?"])
        words = [r.word for r in results]
        for word in words:
            self.assertGreaterEqual(len(word), 2)

    def test_english_counts_aggregated_across_questions(self):
        results = self.extractor.extract([
            "Machine learning models",
            "Deep learning models",
        ])
        count_map = {r.word: r.count for r in results}
        self.assertEqual(count_map.get("models"), 2)
