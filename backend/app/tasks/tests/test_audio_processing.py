"""
Tests for audio processing functions
"""

import asyncio
import json
import os
import subprocess
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

from django.test import TestCase

from app.tasks.audio_processing import (SUPPORTED_FORMATS,
                                        _extract_audio_segment,
                                        _extract_full_audio,
                                        _get_video_duration,
                                        _split_audio_into_segments,
                                        extract_and_split_audio,
                                        process_audio_segments_async,
                                        process_audio_segments_parallel,
                                        transcribe_audio_segment_async)
from app.utils.task_helpers import TemporaryFileManager


class SupportedFormatsTests(TestCase):
    """Tests for supported audio formats"""

    def test_common_formats_supported(self):
        """Test that common audio formats are supported"""
        common_formats = [".mp3", ".mp4", ".wav", ".flac", ".ogg", ".m4a"]
        for fmt in common_formats:
            self.assertIn(fmt, SUPPORTED_FORMATS)

    def test_webm_supported(self):
        """Test that webm format is supported"""
        self.assertIn(".webm", SUPPORTED_FORMATS)


class GetVideoDurationTests(TestCase):
    """Tests for _get_video_duration function"""

    @patch("subprocess.run")
    def test_returns_duration_in_seconds(self, mock_run):
        """Test that duration is returned in seconds"""
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"format": {"duration": "125.5"}})
        mock_run.return_value = mock_result

        duration = _get_video_duration("/path/to/video.mp4")

        self.assertEqual(duration, 125.5)
        mock_run.assert_called_once()

    @patch("subprocess.run")
    def test_calls_ffprobe_with_correct_args(self, mock_run):
        """Test that ffprobe is called with correct arguments"""
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"format": {"duration": "60.0"}})
        mock_run.return_value = mock_result

        _get_video_duration("/path/to/video.mp4")

        args = mock_run.call_args[0][0]
        self.assertEqual(args[0], "ffprobe")
        self.assertIn("-print_format", args)
        self.assertIn("json", args)
        self.assertIn("-show_format", args)

    @patch("subprocess.run")
    def test_handles_integer_duration(self, mock_run):
        """Test handling of integer duration values"""
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"format": {"duration": "300"}})
        mock_run.return_value = mock_result

        duration = _get_video_duration("/path/to/video.mp4")

        self.assertEqual(duration, 300.0)


class ExtractFullAudioTests(TestCase):
    """Tests for _extract_full_audio function"""

    @patch("os.path.getsize")
    @patch("subprocess.run")
    def test_extracts_audio_as_mp3(self, mock_run, mock_getsize):
        """Test that audio is extracted as MP3"""
        mock_getsize.return_value = 1024 * 1024  # 1 MB

        with tempfile.TemporaryDirectory() as temp_dir:
            audio_path, size_mb = _extract_full_audio("/path/to/video.mp4", temp_dir)

            self.assertTrue(audio_path.endswith(".mp3"))
            self.assertEqual(size_mb, 1.0)

    @patch("os.path.getsize")
    @patch("subprocess.run")
    def test_ffmpeg_called_with_correct_args(self, mock_run, mock_getsize):
        """Test that ffmpeg is called with correct arguments"""
        mock_getsize.return_value = 1024 * 1024

        with tempfile.TemporaryDirectory() as temp_dir:
            _extract_full_audio("/path/to/video.mp4", temp_dir)

            args = mock_run.call_args[0][0]
            self.assertEqual(args[0], "ffmpeg")
            self.assertIn("-vn", args)  # No video
            self.assertIn("-acodec", args)
            self.assertIn("mp3", args)
            self.assertIn("-ab", args)
            self.assertIn("128k", args)

    @patch("os.path.getsize")
    @patch("subprocess.run")
    def test_returns_size_in_megabytes(self, mock_run, mock_getsize):
        """Test that size is returned in megabytes"""
        mock_getsize.return_value = 5 * 1024 * 1024  # 5 MB

        with tempfile.TemporaryDirectory() as temp_dir:
            _, size_mb = _extract_full_audio("/path/to/video.mp4", temp_dir)

            self.assertEqual(size_mb, 5.0)


class ExtractAudioSegmentTests(TestCase):
    """Tests for _extract_audio_segment function"""

    @patch("subprocess.run")
    def test_extracts_segment_with_correct_timing(self, mock_run):
        """Test that segment is extracted with correct start and end times"""
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _extract_audio_segment(
                "/path/to/video.mp4", 10.0, 20.0, 0, temp_dir
            )

            self.assertEqual(result["start_time"], 10.0)
            self.assertEqual(result["end_time"], 20.0)
            self.assertIn("audio_segment_0", result["path"])

    @patch("subprocess.run")
    def test_ffmpeg_called_with_segment_duration(self, mock_run):
        """Test that ffmpeg is called with correct segment duration"""
        with tempfile.TemporaryDirectory() as temp_dir:
            _extract_audio_segment("/path/to/video.mp4", 10.0, 25.0, 0, temp_dir)

            args = mock_run.call_args[0][0]
            # Check -ss (start time) and -t (duration)
            ss_index = args.index("-ss")
            t_index = args.index("-t")
            self.assertEqual(args[ss_index + 1], "10.0")
            self.assertEqual(args[t_index + 1], "15.0")  # 25.0 - 10.0

    @patch("subprocess.run")
    def test_segment_index_in_filename(self, mock_run):
        """Test that segment index is included in filename"""
        with tempfile.TemporaryDirectory() as temp_dir:
            result = _extract_audio_segment("/path/to/video.mp4", 0, 10, 5, temp_dir)

            self.assertIn("audio_segment_5", result["path"])


class SplitAudioIntoSegmentsTests(TestCase):
    """Tests for _split_audio_into_segments function"""

    @patch("app.tasks.audio_processing._extract_audio_segment")
    def test_calculates_correct_number_of_segments(self, mock_extract):
        """Test that correct number of segments is calculated"""
        mock_extract.return_value = {
            "path": "/tmp/audio.mp3",
            "start_time": 0,
            "end_time": 10,
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            # 50 MB audio, 24 MB max -> should split into 3 segments (with 20% margin)
            segments = _split_audio_into_segments(
                "/path/to/video.mp4", 100.0, 50.0, 24.0, temp_dir
            )

            # 50 / (24 * 0.8) = 50 / 19.2 = 2.6 -> 3 segments
            self.assertEqual(len(segments), 3)

    @patch("app.tasks.audio_processing._extract_audio_segment")
    def test_segment_timestamps_are_sequential(self, mock_extract):
        """Test that segment timestamps are sequential"""
        call_count = [0]

        def mock_extract_segment(input_path, start, end, index, temp_dir):
            call_count[0] += 1
            return {
                "path": f"/tmp/audio_{index}.mp3",
                "start_time": start,
                "end_time": end,
            }

        mock_extract.side_effect = mock_extract_segment

        with tempfile.TemporaryDirectory() as temp_dir:
            segments = _split_audio_into_segments(
                "/path/to/video.mp4", 60.0, 50.0, 24.0, temp_dir
            )

            # Verify timestamps are sequential
            for i in range(len(segments) - 1):
                self.assertLessEqual(
                    segments[i]["end_time"], segments[i + 1]["start_time"] + 0.1
                )


class ExtractAndSplitAudioTests(TestCase):
    """Tests for extract_and_split_audio function"""

    @patch("app.tasks.audio_processing._extract_full_audio")
    @patch("app.tasks.audio_processing._get_video_duration")
    def test_no_split_when_within_limit(self, mock_duration, mock_extract):
        """Test that no splitting occurs when audio is within limit"""
        mock_duration.return_value = 60.0
        mock_extract.return_value = ("/tmp/audio.mp3", 20.0)  # 20 MB < 24 MB limit

        segments = extract_and_split_audio("/path/to/video.mp4", max_size_mb=24)

        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["start_time"], 0)
        self.assertEqual(segments[0]["end_time"], 60.0)

    @patch("os.remove")
    @patch("app.tasks.audio_processing._split_audio_into_segments")
    @patch("app.tasks.audio_processing._extract_full_audio")
    @patch("app.tasks.audio_processing._get_video_duration")
    def test_splits_when_exceeds_limit(
        self, mock_duration, mock_extract, mock_split, mock_remove
    ):
        """Test that splitting occurs when audio exceeds limit"""
        mock_duration.return_value = 300.0
        mock_extract.return_value = ("/tmp/audio.mp3", 50.0)  # 50 MB > 24 MB limit
        mock_split.return_value = [
            {"path": "/tmp/seg1.mp3", "start_time": 0, "end_time": 100},
            {"path": "/tmp/seg2.mp3", "start_time": 100, "end_time": 200},
            {"path": "/tmp/seg3.mp3", "start_time": 200, "end_time": 300},
        ]

        segments = extract_and_split_audio("/path/to/video.mp4", max_size_mb=24)

        self.assertEqual(len(segments), 3)
        mock_remove.assert_called_once_with(
            "/tmp/audio.mp3"
        )  # Original should be deleted

    @patch("app.tasks.audio_processing._get_video_duration")
    def test_handles_ffprobe_error(self, mock_duration):
        """Test that ffprobe errors are handled gracefully"""
        mock_duration.side_effect = subprocess.CalledProcessError(
            1, "ffprobe", stderr="Error"
        )

        segments = extract_and_split_audio("/path/to/video.mp4")

        self.assertEqual(segments, [])

    @patch("app.tasks.audio_processing._extract_full_audio")
    @patch("app.tasks.audio_processing._get_video_duration")
    def test_registers_temp_files_for_cleanup(self, mock_duration, mock_extract):
        """Test that temp files are registered for cleanup"""
        mock_duration.return_value = 60.0
        mock_extract.return_value = ("/tmp/audio.mp3", 20.0)

        with TemporaryFileManager() as temp_manager:
            segments = extract_and_split_audio(
                "/path/to/video.mp4", temp_manager=temp_manager
            )

            self.assertEqual(len(temp_manager.temp_files), 1)
            self.assertEqual(temp_manager.temp_files[0], "/tmp/audio.mp3")

    @patch("app.tasks.audio_processing._get_video_duration")
    def test_handles_generic_exception(self, mock_duration):
        """Test that generic exceptions are handled gracefully"""
        mock_duration.side_effect = Exception("Unknown error")

        segments = extract_and_split_audio("/path/to/video.mp4")

        self.assertEqual(segments, [])


class TranscribeAudioSegmentAsyncTests(TestCase):
    """Tests for transcribe_audio_segment_async function"""

    def test_successful_transcription(self):
        """Test successful audio segment transcription"""
        mock_client = MagicMock()
        mock_transcription = MagicMock()
        mock_transcription.segments = []

        async def mock_create(**kwargs):
            return mock_transcription

        mock_client.audio.transcriptions.create = mock_create

        segment_info = {"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}

        with patch("builtins.open", MagicMock()):
            result = asyncio.run(
                transcribe_audio_segment_async(mock_client, segment_info, 0)
            )

            transcription, error, index = result
            self.assertIsNotNone(transcription)
            self.assertIsNone(error)
            self.assertEqual(index, 0)

    def test_handles_transcription_error(self):
        """Test handling of transcription error"""
        mock_client = MagicMock()

        async def mock_create(**kwargs):
            raise Exception("API Error")

        mock_client.audio.transcriptions.create = mock_create

        segment_info = {"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}

        with patch("builtins.open", MagicMock()):
            result = asyncio.run(
                transcribe_audio_segment_async(mock_client, segment_info, 0)
            )

            transcription, error, index = result
            self.assertIsNone(transcription)
            self.assertIsNotNone(error)


class ProcessAudioSegmentsAsyncTests(TestCase):
    """Tests for process_audio_segments_async function"""

    def test_adjusts_timestamps_for_segments(self):
        """Test that timestamps are adjusted based on segment start time"""
        mock_client = MagicMock()

        segment1_transcription = MagicMock()
        segment1_transcription.segments = [
            MagicMock(start=0, end=5, text="Hello"),
            MagicMock(start=5, end=10, text="World"),
        ]

        async def mock_create(**kwargs):
            return segment1_transcription

        mock_client.audio.transcriptions.create = mock_create

        audio_segments = [
            {"path": "/tmp/audio1.mp3", "start_time": 30.0, "end_time": 40.0}
        ]

        with patch("builtins.open", MagicMock()):
            result = asyncio.run(
                process_audio_segments_async(mock_client, audio_segments)
            )

            # Timestamps should be adjusted by start_time (30.0)
            self.assertEqual(result[0]["start"], 30.0)
            self.assertEqual(result[0]["end"], 35.0)
            self.assertEqual(result[1]["start"], 35.0)
            self.assertEqual(result[1]["end"], 40.0)

    def test_handles_failed_segments_gracefully(self):
        """Test that failed segments don't crash the entire process"""
        mock_client = MagicMock()

        call_count = [0]

        async def mock_create(**kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise Exception("Segment 1 failed")
            result = MagicMock()
            result.segments = [MagicMock(start=0, end=5, text="Success")]
            return result

        mock_client.audio.transcriptions.create = mock_create

        audio_segments = [
            {"path": "/tmp/audio1.mp3", "start_time": 0, "end_time": 10},
            {"path": "/tmp/audio2.mp3", "start_time": 10, "end_time": 20},
        ]

        with patch("builtins.open", MagicMock()):
            result = asyncio.run(
                process_audio_segments_async(mock_client, audio_segments)
            )

            # Should have results from successful segment only
            self.assertEqual(len(result), 1)


class ProcessAudioSegmentsParallelTests(TestCase):
    """Tests for process_audio_segments_parallel function"""

    @patch("app.tasks.audio_processing.asyncio.run")
    @patch("app.tasks.audio_processing.AsyncOpenAI")
    def test_creates_async_client(self, mock_async_openai, mock_asyncio_run):
        """Test that async client is created from sync client"""
        mock_sync_client = MagicMock()
        mock_sync_client.api_key = "test-key"
        mock_sync_client._base_url = None

        mock_asyncio_run.return_value = []

        process_audio_segments_parallel(mock_sync_client, [])

        mock_async_openai.assert_called_once_with(api_key="test-key")

    @patch("app.tasks.audio_processing.asyncio.run")
    @patch("app.tasks.audio_processing.AsyncOpenAI")
    def test_preserves_base_url_for_local_whisper(
        self, mock_async_openai, mock_asyncio_run
    ):
        """Test that base_url is preserved for local whisper server"""
        mock_sync_client = MagicMock()
        mock_sync_client.api_key = "test-key"
        mock_sync_client._base_url = "http://localhost:8080"

        mock_asyncio_run.return_value = []

        process_audio_segments_parallel(mock_sync_client, [])

        mock_async_openai.assert_called_once_with(
            api_key="test-key", base_url="http://localhost:8080"
        )
