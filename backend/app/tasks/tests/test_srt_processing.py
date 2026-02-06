"""
Tests for SRT processing functions
"""

from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from app.tasks.srt_processing import (apply_scene_splitting, count_scenes,
                                      create_srt_content, format_time_for_srt,
                                      parse_srt_scenes,
                                      transcribe_and_create_srt)


class FormatTimeForSrtTests(TestCase):
    """Tests for format_time_for_srt function"""

    def test_formats_zero_seconds(self):
        """Test formatting of zero seconds"""
        result = format_time_for_srt(0)
        self.assertEqual(result, "00:00:00,000")

    def test_formats_seconds_only(self):
        """Test formatting of seconds only"""
        result = format_time_for_srt(45.5)
        self.assertEqual(result, "00:00:45,500")

    def test_formats_minutes_and_seconds(self):
        """Test formatting of minutes and seconds"""
        result = format_time_for_srt(125.75)  # 2 min 5.75 sec
        self.assertEqual(result, "00:02:05,750")

    def test_formats_hours(self):
        """Test formatting of hours"""
        result = format_time_for_srt(3665.123)  # 1 hour, 1 min, 5.123 sec
        self.assertEqual(result, "01:01:05,123")

    def test_formats_large_hours(self):
        """Test formatting of large hour values"""
        result = format_time_for_srt(36000.0)  # 10 hours
        self.assertEqual(result, "10:00:00,000")

    def test_handles_fractional_milliseconds(self):
        """Test handling of fractional milliseconds"""
        result = format_time_for_srt(1.9999)
        # Should truncate, not round
        self.assertIn(",999", result)


class CreateSrtContentTests(TestCase):
    """Tests for create_srt_content function"""

    def test_creates_single_segment_srt(self):
        """Test creating SRT with single segment"""
        segments = [{"start": 0, "end": 5, "text": "Hello world"}]

        result = create_srt_content(segments)

        self.assertIn("1", result)
        self.assertIn("00:00:00,000 --> 00:00:05,000", result)
        self.assertIn("Hello world", result)

    def test_creates_multiple_segments_srt(self):
        """Test creating SRT with multiple segments"""
        segments = [
            {"start": 0, "end": 5, "text": "Hello"},
            {"start": 5, "end": 10, "text": "World"},
            {"start": 10, "end": 15, "text": "Test"},
        ]

        result = create_srt_content(segments)

        self.assertIn("1", result)
        self.assertIn("2", result)
        self.assertIn("3", result)
        self.assertIn("Hello", result)
        self.assertIn("World", result)
        self.assertIn("Test", result)

    def test_strips_text_whitespace(self):
        """Test that text whitespace is stripped"""
        segments = [{"start": 0, "end": 5, "text": "  Hello world  "}]

        result = create_srt_content(segments)

        self.assertIn("Hello world", result)
        self.assertNotIn("  Hello", result)

    def test_handles_empty_segments(self):
        """Test handling of empty segments list"""
        segments = []

        result = create_srt_content(segments)

        self.assertEqual(result, "")

    def test_sequential_numbering(self):
        """Test that segments are numbered sequentially starting from 1"""
        segments = [
            {"start": i * 5, "end": (i + 1) * 5, "text": f"Segment {i}"}
            for i in range(5)
        ]

        result = create_srt_content(segments)
        lines = result.split("\n")

        # Find all sequence numbers (lines that are just digits)
        seq_numbers = [line for line in lines if line.strip().isdigit()]
        self.assertEqual(seq_numbers, ["1", "2", "3", "4", "5"])


class CountScenesTests(TestCase):
    """Tests for count_scenes function"""

    def test_counts_single_scene(self):
        """Test counting single scene"""
        srt_content = "1\n00:00:00,000 --> 00:00:05,000\nHello\n"

        result = count_scenes(srt_content)

        self.assertEqual(result, 1)

    def test_counts_multiple_scenes(self):
        """Test counting multiple scenes"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Hello

2
00:00:05,000 --> 00:00:10,000
World

3
00:00:10,000 --> 00:00:15,000
Test
"""

        result = count_scenes(srt_content)

        self.assertEqual(result, 3)

    def test_handles_empty_content(self):
        """Test handling of empty content"""
        result = count_scenes("")

        self.assertEqual(result, 0)

    def test_ignores_non_numeric_lines(self):
        """Test that non-numeric lines are ignored"""
        srt_content = "1\n00:00:00,000 --> 00:00:05,000\nHello123\n"

        result = count_scenes(srt_content)

        self.assertEqual(result, 1)  # Only "1" is counted, not "Hello123"


class ParseSrtScenesTests(TestCase):
    """Tests for parse_srt_scenes function"""

    def test_parses_single_scene(self):
        """Test parsing single scene"""
        srt_content = "1\n00:00:00,000 --> 00:00:05,000\nHello world\n"

        result = parse_srt_scenes(srt_content)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["text"], "Hello world")
        self.assertEqual(result[0]["start_time"], "00:00:00,000")
        self.assertEqual(result[0]["end_time"], "00:00:05,000")

    def test_parses_multiple_scenes(self):
        """Test parsing multiple scenes"""
        srt_content = """1
00:00:00,000 --> 00:00:05,000
Hello

2
00:00:05,000 --> 00:00:10,000
World
"""

        result = parse_srt_scenes(srt_content)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["text"], "Hello")
        self.assertEqual(result[1]["text"], "World")

    def test_includes_timing_in_seconds(self):
        """Test that timing in seconds is included"""
        srt_content = "1\n00:01:30,500 --> 00:02:00,000\nTest\n"

        result = parse_srt_scenes(srt_content)

        self.assertEqual(result[0]["start_sec"], 90.5)
        self.assertEqual(result[0]["end_sec"], 120.0)


@override_settings(EMBEDDING_PROVIDER="openai")
class ApplySceneSplittingTests(TestCase):
    """Tests for apply_scene_splitting function"""

    @patch("app.tasks.srt_processing.SceneSplitter")
    def test_applies_scene_splitting(self, mock_splitter_class):
        """Test that scene splitting is applied"""
        mock_splitter = MagicMock()
        mock_splitter.process.return_value = (
            "1\n00:00:00,000 --> 00:00:10,000\nSplit scene\n"
        )
        mock_splitter_class.return_value = mock_splitter

        srt_content = "1\n00:00:00,000 --> 00:00:05,000\nHello\n\n2\n00:00:05,000 --> 00:00:10,000\nWorld\n"

        result_srt, scene_count = apply_scene_splitting(srt_content, "test-api-key", 2)

        self.assertIn("Split scene", result_srt)
        mock_splitter.process.assert_called_once()

    @patch("app.tasks.srt_processing.SceneSplitter")
    def test_returns_original_on_error(self, mock_splitter_class):
        """Test that original SRT is returned on error"""
        mock_splitter = MagicMock()
        mock_splitter.process.side_effect = Exception("Splitting failed")
        mock_splitter_class.return_value = mock_splitter

        srt_content = "1\n00:00:00,000 --> 00:00:05,000\nOriginal content\n"

        result_srt, scene_count = apply_scene_splitting(srt_content, "test-api-key", 1)

        self.assertEqual(result_srt, srt_content)
        self.assertEqual(scene_count, 1)

    @override_settings(EMBEDDING_PROVIDER="openai")
    def test_requires_api_key_for_openai(self):
        """Test that missing API key for OpenAI falls back to original SRT"""
        srt_content = "1\n00:00:00,000 --> 00:00:05,000\nTest\n"

        result_srt, scene_count = apply_scene_splitting(srt_content, None, 1)

        self.assertEqual(result_srt, srt_content)
        self.assertEqual(scene_count, 1)


class TranscribeAndCreateSrtTests(TestCase):
    """Tests for transcribe_and_create_srt function"""

    @patch("app.tasks.srt_processing.process_audio_segments_parallel")
    def test_creates_srt_from_segments(self, mock_process):
        """Test that SRT is created from audio segments"""
        mock_process.return_value = [
            {"start": 0, "end": 5, "text": "Hello"},
            {"start": 5, "end": 10, "text": "World"},
        ]

        audio_segments = [{"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}]

        result = transcribe_and_create_srt(MagicMock(), audio_segments)

        self.assertIn("Hello", result)
        self.assertIn("World", result)
        self.assertIn("00:00:00,000 --> 00:00:05,000", result)

    @patch("app.tasks.srt_processing.process_audio_segments_parallel")
    def test_returns_none_on_empty_segments(self, mock_process):
        """Test that None is returned when no segments are transcribed"""
        mock_process.return_value = []

        audio_segments = [{"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}]

        result = transcribe_and_create_srt(MagicMock(), audio_segments)

        self.assertIsNone(result)

    @patch("app.tasks.srt_processing.process_audio_segments_parallel")
    def test_uses_correct_model(self, mock_process):
        """Test that correct Whisper model is used"""
        mock_process.return_value = [{"start": 0, "end": 5, "text": "Test"}]

        mock_client = MagicMock()
        audio_segments = [{"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}]

        transcribe_and_create_srt(mock_client, audio_segments, model="whisper-large")

        mock_process.assert_called_once_with(
            mock_client, audio_segments, "whisper-large"
        )
