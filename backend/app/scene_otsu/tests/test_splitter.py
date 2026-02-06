"""
Tests for scene_otsu SceneSplitter class
"""

from unittest.mock import MagicMock, patch

import numpy as np
from django.test import TestCase, override_settings

from app.scene_otsu.splitter import SceneSplitter


@override_settings(
    EMBEDDING_PROVIDER="openai", EMBEDDING_MODEL="text-embedding-3-small"
)
class SceneSplitterInitializationTests(TestCase):
    """Tests for SceneSplitter initialization"""

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_initialization_with_api_key(self, mock_create_embedder):
        """Test initialization with API key"""
        SceneSplitter(api_key="test-key")

        mock_create_embedder.assert_called_once_with(api_key="test-key", batch_size=16)

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_initialization_with_custom_batch_size(self, mock_create_embedder):
        """Test initialization with custom batch size"""
        SceneSplitter(api_key="test-key", batch_size=32)

        mock_create_embedder.assert_called_once_with(api_key="test-key", batch_size=32)


@override_settings(
    EMBEDDING_PROVIDER="openai", EMBEDDING_MODEL="text-embedding-3-small"
)
class SceneSplitterOtsuThresholdTests(TestCase):
    """Tests for SceneSplitter._find_otsu_threshold"""

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_returns_zero_for_single_embedding(self, mock_create_embedder):
        """Test that zero is returned for single embedding"""
        splitter = SceneSplitter(api_key="test-key")

        embeddings = np.array([[0.1, 0.2, 0.3]])

        result = splitter._find_otsu_threshold(embeddings)

        self.assertEqual(result, 0)

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_finds_threshold_for_two_embeddings(self, mock_create_embedder):
        """Test finding threshold for two embeddings"""
        splitter = SceneSplitter(api_key="test-key")

        embeddings = np.array(
            [
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
            ]
        )

        result = splitter._find_otsu_threshold(embeddings)

        self.assertEqual(result, 1)  # Should split after first embedding

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_finds_optimal_split_point(self, mock_create_embedder):
        """Test finding optimal split point in sequence"""
        splitter = SceneSplitter(api_key="test-key")

        # Create embeddings with clear clusters
        embeddings = np.array(
            [
                [1.0, 0.0],
                [0.9, 0.1],
                [0.8, 0.2],  # First cluster
                [0.0, 1.0],
                [0.1, 0.9],  # Second cluster
            ]
        )

        result = splitter._find_otsu_threshold(embeddings)

        # Should split between clusters (after index 2 or 3)
        self.assertIn(result, [3, 4])


@override_settings(
    EMBEDDING_PROVIDER="openai", EMBEDDING_MODEL="text-embedding-3-small"
)
class SceneSplitterSplitLongTextTests(TestCase):
    """Tests for SceneSplitter._split_long_text"""

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_returns_single_scene_if_within_limit(self, mock_create_embedder):
        """Test returning single scene if text is within limit"""
        mock_embedder = MagicMock()
        mock_encoding = MagicMock()
        mock_encoding.encode.return_value = [1, 2, 3]  # 3 tokens
        mock_embedder.encoding = mock_encoding
        mock_create_embedder.return_value = mock_embedder

        splitter = SceneSplitter(api_key="test-key")

        result = splitter._split_long_text(
            "Short text",
            "00:00:00,000",
            "00:00:05,000",
            max_tokens=10,
        )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].subtitles, ["Short text"])

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_splits_long_text_into_chunks(self, mock_create_embedder):
        """Test splitting long text into chunks"""
        mock_embedder = MagicMock()
        mock_encoding = MagicMock()
        # Simulate 10 tokens
        mock_encoding.encode.return_value = list(range(10))
        mock_encoding.decode.side_effect = lambda tokens: f"chunk_{len(tokens)}"
        mock_embedder.encoding = mock_encoding
        mock_create_embedder.return_value = mock_embedder

        splitter = SceneSplitter(api_key="test-key")

        result = splitter._split_long_text(
            "Long text that exceeds the limit",
            "00:00:00,000",
            "00:00:10,000",
            max_tokens=5,
        )

        self.assertEqual(len(result), 2)  # 10 tokens / 5 = 2 chunks


@override_settings(
    EMBEDDING_PROVIDER="openai", EMBEDDING_MODEL="text-embedding-3-small"
)
class SceneSplitterProcessTests(TestCase):
    """Tests for SceneSplitter.process"""

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_returns_empty_string_for_empty_input(self, mock_create_embedder):
        """Test returning empty string for empty input"""
        splitter = SceneSplitter(api_key="test-key")

        result = splitter.process("")

        self.assertEqual(result, "")

    @patch("app.scene_otsu.splitter.create_embedder")
    @patch("app.scene_otsu.splitter.SubtitleParser.parse_srt_string")
    def test_returns_empty_string_for_no_subtitles(
        self, mock_parse, mock_create_embedder
    ):
        """Test returning empty string when no subtitles parsed"""
        mock_parse.return_value = []

        splitter = SceneSplitter(api_key="test-key")

        result = splitter.process("invalid srt")

        self.assertEqual(result, "")

    @patch("app.scene_otsu.splitter.normalize")
    @patch("app.scene_otsu.splitter.create_embedder")
    def test_processes_srt_and_returns_split(
        self, mock_create_embedder, mock_normalize
    ):
        """Test processing SRT and returning split result"""
        mock_embedder = MagicMock()
        mock_embedder.get_embeddings.return_value = np.array(
            [
                [1.0, 0.0],
                [0.0, 1.0],
            ]
        )
        mock_embedder.count_tokens.return_value = 5
        mock_create_embedder.return_value = mock_embedder
        mock_normalize.return_value = np.array(
            [
                [1.0, 0.0],
                [0.0, 1.0],
            ]
        )

        splitter = SceneSplitter(api_key="test-key")

        srt_content = """1
00:00:00,000 --> 00:00:05,000
Hello world

2
00:00:05,000 --> 00:00:10,000
Test content"""

        result = splitter.process(srt_content, max_tokens=200)

        self.assertIsInstance(result, str)
        self.assertIn("-->", result)

    @patch("app.scene_otsu.splitter.normalize")
    @patch("app.scene_otsu.splitter.create_embedder")
    def test_handles_single_subtitle(self, mock_create_embedder, mock_normalize):
        """Test handling single subtitle"""
        mock_embedder = MagicMock()
        mock_embedder.get_embeddings.return_value = np.array([[1.0, 0.0]])
        mock_embedder.count_tokens.return_value = 5
        mock_create_embedder.return_value = mock_embedder
        mock_normalize.return_value = np.array([[1.0, 0.0]])

        splitter = SceneSplitter(api_key="test-key")

        srt_content = """1
00:00:00,000 --> 00:00:05,000
Single subtitle"""

        result = splitter.process(srt_content, max_tokens=200)

        self.assertIn("Single subtitle", result)


@override_settings(
    EMBEDDING_PROVIDER="openai", EMBEDDING_MODEL="text-embedding-3-small"
)
class SceneSplitterTokenPrefixSumTests(TestCase):
    """Tests for SceneSplitter._calculate_token_prefix_sum"""

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_calculates_prefix_sum(self, mock_create_embedder):
        """Test calculating token prefix sum"""
        mock_embedder = MagicMock()
        mock_embedder.count_tokens.side_effect = [10, 20, 30]
        mock_create_embedder.return_value = mock_embedder

        splitter = SceneSplitter(api_key="test-key")

        texts = ["text1", "text2", "text3"]
        result = splitter._calculate_token_prefix_sum(texts)

        self.assertEqual(result, [0, 10, 30, 60])

    @patch("app.scene_otsu.splitter.create_embedder")
    def test_empty_texts_returns_zero(self, mock_create_embedder):
        """Test that empty texts returns [0]"""
        splitter = SceneSplitter(api_key="test-key")

        result = splitter._calculate_token_prefix_sum([])

        self.assertEqual(result, [0])
