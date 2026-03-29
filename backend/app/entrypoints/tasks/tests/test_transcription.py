"""
Tests for transcription task (thin trigger).
Business logic (audio extraction, Whisper, scene splitting) is tested separately
at the infrastructure/use-case level.
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.dependencies.tasks import (
    TranscriptionRejectedError,
    TranscriptionTargetMissingError,
)
from app.entrypoints.tasks.transcription import transcribe_video
from app.infrastructure.models import Video

User = get_user_model()

_TRANSCRIBE = "app.infrastructure.external.transcription_gateway.WhisperTranscriptionGateway.run"
_ENQUEUE_INDEXING = "app.infrastructure.tasks.task_gateway.CeleryVideoTaskGateway.enqueue_indexing"
_GET_FILE_SIZE = "app.infrastructure.external.file_upload_gateway.R2FileUploadGateway.get_file_size"


class TranscribeVideoTaskTests(TestCase):
    """Tests for transcribe_video Celery task"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    @patch(_GET_FILE_SIZE, return_value=1024)
    @patch(_TRANSCRIBE)
    def test_successful_transcription_sets_indexing_status(self, mock_transcribe, _mock_size):
        """Successful transcription sets video status to indexing (async indexing pending)"""
        srt = "1\n00:00:00,000 --> 00:00:10,000\nHello\n"
        mock_transcribe.return_value = srt

        video = Video.objects.create(user=self.user, title="Test Video", status="pending")

        with patch(_ENQUEUE_INDEXING):
            transcribe_video(video.id)

        video.refresh_from_db()
        self.assertEqual(video.status, "indexing")
        self.assertEqual(video.transcript, srt)

    @patch(_GET_FILE_SIZE, return_value=1024)
    @patch(_ENQUEUE_INDEXING)
    @patch(_TRANSCRIBE)
    def test_successful_transcription_enqueues_indexing_task(self, mock_transcribe, mock_enqueue, _mock_size):
        """Successful transcription enqueues the vector indexing task"""
        mock_transcribe.return_value = "1\n00:00:00,000 --> 00:00:10,000\nHello\n"

        video = Video.objects.create(user=self.user, title="Test Video", status="pending")

        transcribe_video(video.id)

        mock_enqueue.assert_called_once_with(video.id)

    @patch(_GET_FILE_SIZE, return_value=1024)
    @patch(_TRANSCRIBE)
    def test_transcription_failure_sets_error_status(self, mock_transcribe, _mock_size):
        """Transcription failure sets video status to error"""
        mock_transcribe.side_effect = RuntimeError("Transcription failed")

        video = Video.objects.create(user=self.user, title="Test Video", status="pending")

        with self.assertRaises(Exception):
            transcribe_video(video.id)

        video.refresh_from_db()
        self.assertEqual(video.status, "error")
        self.assertIn("Transcription failed", video.error_message)

    def test_handles_nonexistent_video(self):
        """Non-existent video raises an exception"""
        with self.assertRaises(TranscriptionTargetMissingError):
            transcribe_video(99999)

    @patch("app.entrypoints.tasks.transcription.run_transcription")
    def test_does_not_retry_rejected_transcription(self, mock_run_transcription):
        mock_run_transcription.side_effect = TranscriptionRejectedError("Processing limit exceeded")

        video = Video.objects.create(user=self.user, title="Test Video", status="pending")

        original_retry = transcribe_video.retry
        original_retries = getattr(transcribe_video.request, "retries", 0)
        transcribe_video.retry = MagicMock()
        transcribe_video.request.retries = 0
        self.addCleanup(setattr, transcribe_video, "retry", original_retry)
        self.addCleanup(setattr, transcribe_video.request, "retries", original_retries)

        transcribe_video(video.id)

        transcribe_video.retry.assert_not_called()
