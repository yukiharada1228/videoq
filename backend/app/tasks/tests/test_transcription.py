"""
Tests for transcription task (thin trigger).
Business logic (audio extraction, Whisper, scene splitting) is tested separately
at the infrastructure/use-case level.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from app.models import Video
from app.tasks.transcription import transcribe_video

User = get_user_model()

_TRANSCRIBE = "app.infrastructure.external.transcription_gateway.WhisperTranscriptionGateway.run"
_INDEX = "app.infrastructure.external.vector_gateway.DjangoVectorIndexingGateway.index_video_transcript"


@override_settings(OPENAI_API_KEY="test-api-key")
class TranscribeVideoTaskTests(TestCase):
    """Tests for transcribe_video Celery task"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )

    @patch(_INDEX)
    @patch(_TRANSCRIBE)
    def test_successful_transcription_sets_completed_status(self, mock_transcribe, mock_index):
        """Successful transcription sets video status to completed"""
        srt = "1\n00:00:00,000 --> 00:00:10,000\nHello\n"
        mock_transcribe.return_value = srt

        video = Video.objects.create(user=self.user, title="Test Video", status="pending")

        transcribe_video(video.id)

        video.refresh_from_db()
        self.assertEqual(video.status, "completed")
        self.assertEqual(video.transcript, srt)

    @patch(_INDEX)
    @patch(_TRANSCRIBE)
    def test_successful_transcription_triggers_indexing(self, mock_transcribe, mock_index):
        """Successful transcription triggers vector indexing"""
        mock_transcribe.return_value = "1\n00:00:00,000 --> 00:00:10,000\nHello\n"

        video = Video.objects.create(user=self.user, title="Test Video", status="pending")

        transcribe_video(video.id)

        mock_index.assert_called_once()

    @patch(_TRANSCRIBE)
    def test_transcription_failure_sets_error_status(self, mock_transcribe):
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
        with self.assertRaises(Exception):
            transcribe_video(99999)
