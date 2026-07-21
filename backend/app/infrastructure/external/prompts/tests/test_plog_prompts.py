"""Tests for PLOG locale-aware prompt helpers."""

from django.test import SimpleTestCase

from app.infrastructure.external.prompts.loader import (
    _load_prompt_config,
    build_fallback_learning_object,
    detect_transcript_locale,
    get_plog_study_config,
    normalize_learning_object_for_locale,
    resolve_opening_question,
)


class PlogPromptLocaleTests(SimpleTestCase):
    def setUp(self):
        _load_prompt_config.cache_clear()

    def tearDown(self):
        _load_prompt_config.cache_clear()

    def test_detect_japanese_transcript(self):
        text = "本日はノットゲートについて説明します。" * 3
        self.assertEqual(detect_transcript_locale(text), "ja")

    def test_detect_english_transcript(self):
        text = "Today we introduce the NOT gate and truth tables." * 3
        self.assertEqual(detect_transcript_locale(text), "default")

    def test_japanese_fallback_learning_object(self):
        fb = build_fallback_learning_object("ノットゲート", "ja")
        self.assertIn("ノットゲート", fb["opening_question"])
        self.assertNotIn("What do you already know", fb["opening_question"])
        self.assertTrue(fb["hint_ladder"])
        self.assertTrue(all("ノットゲート" in h for h in fb["hint_ladder"]))

    def test_english_fallback_learning_object(self):
        fb = build_fallback_learning_object("NOT gate", "en")
        self.assertIn("What do you already know about NOT gate?", fb["opening_question"])

    def test_resolve_opening_replaces_known_english_fallback_only(self):
        opening = resolve_opening_question(
            "オアゲート",
            "What do you already know about オアゲート?",
            "ja",
        )
        self.assertNotIn("What do you already know", opening)
        self.assertIn("オアゲート", opening)

        # Arbitrary English LLM text is left alone (build should prevent this).
        custom = "What is the basic function of オアゲート?"
        self.assertEqual(resolve_opening_question("オアゲート", custom, "ja"), custom)

    def test_normalize_replaces_english_fallback_for_ja_lecture(self):
        normalized = normalize_learning_object_for_locale(
            "オアゲート",
            opening_question="What do you already know about オアゲート?",
            hint_ladder=[
                "Recall where オアゲート was introduced in the lecture.",
                "Compare オアゲート to a related earlier idea.",
                "State the key idea of オアゲート in one sentence.",
            ],
            locale="ja",
        )
        self.assertNotIn("What do you already know", normalized["opening_question"])
        self.assertTrue(all("思い出" in h or "比べ" in h or "要点" in h for h in normalized["hint_ladder"]))

    def test_plog_study_config_ja_has_path_complete(self):
        cfg = get_plog_study_config("ja")
        self.assertIn("学習パス", cfg["path_complete"])
        self.assertIn("必ず日本語", cfg["policy"])
        self.assertIn("refuse_reveal", cfg)
