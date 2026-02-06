"""
Tests for transcription task
"""

from unittest.mock import MagicMock, PropertyMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from app.models import Video
from app.tasks.transcription import (cleanup_external_upload,
                                     download_video_from_storage,
                                     handle_transcription_error,
                                     save_transcription_result,
                                     transcribe_video)
from app.utils.task_helpers import TemporaryFileManager

User = get_user_model()


class DownloadVideoFromStorageTests(TestCase):
    """Tests for download_video_from_storage function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="pending",
        )

    def test_local_file_returns_path_directly(self):
        """Test that local files return path directly"""
        with TemporaryFileManager() as temp_manager:
            mock_file = MagicMock()
            mock_file.path = "/local/path/video.mp4"
            self.video.file = mock_file

            path, file_obj = download_video_from_storage(
                self.video, self.video.id, temp_manager
            )

            self.assertEqual(path, "/local/path/video.mp4")
            self.assertEqual(file_obj, mock_file)

    def test_remote_file_downloads_to_temp(self):
        """Test that remote files (S3) are downloaded to temp directory"""
        with TemporaryFileManager() as temp_manager:
            mock_file = MagicMock()
            mock_file.path = PropertyMock(side_effect=NotImplementedError)
            mock_file.name = "test_video.mp4"

            mock_remote_content = b"fake video content"
            mock_file.open.return_value.__enter__ = MagicMock(
                return_value=MagicMock(read=MagicMock(return_value=mock_remote_content))
            )
            mock_file.open.return_value.__exit__ = MagicMock(return_value=False)

            self.video.file = mock_file

            with patch("builtins.open", MagicMock()):
                with patch("os.path.basename", return_value="test_video.mp4"):
                    # Force NotImplementedError on path access
                    type(mock_file).path = PropertyMock(side_effect=NotImplementedError)

                    path, file_obj = download_video_from_storage(
                        self.video, self.video.id, temp_manager
                    )

                    self.assertIn("video_", path)
                    self.assertEqual(len(temp_manager.temp_files), 1)

    def test_attribute_error_triggers_download(self):
        """Test that AttributeError on path also triggers download"""
        with TemporaryFileManager() as temp_manager:
            mock_file = MagicMock(spec=['name', 'open'])
            mock_file.name = "test_video.mp4"

            mock_remote_content = b"fake video content"
            mock_file.open.return_value.__enter__ = MagicMock(
                return_value=MagicMock(read=MagicMock(return_value=mock_remote_content))
            )
            mock_file.open.return_value.__exit__ = MagicMock(return_value=False)

            with patch.object(type(self.video), 'file', new_callable=PropertyMock, return_value=mock_file):
                with patch("builtins.open", MagicMock()):
                    path, file_obj = download_video_from_storage(
                        self.video, self.video.id, temp_manager
                    )

                    self.assertIn("video_", path)


class CleanupExternalUploadTests(TestCase):
    """Tests for cleanup_external_upload function"""

    def test_deletes_file_successfully(self):
        """Test that file is deleted successfully"""
        mock_file = MagicMock()

        cleanup_external_upload(mock_file, 1)

        mock_file.delete.assert_called_once_with(save=False)

    def test_handles_none_file_gracefully(self):
        """Test that None file is handled gracefully"""
        # Should not raise any exception
        cleanup_external_upload(None, 1)

    def test_handles_delete_exception_gracefully(self):
        """Test that delete exception is logged but not raised"""
        mock_file = MagicMock()
        mock_file.delete.side_effect = Exception("Delete failed")

        # Should not raise any exception
        cleanup_external_upload(mock_file, 1)


class SaveTranscriptionResultTests(TestCase):
    """Tests for save_transcription_result function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="processing",
        )

    def test_saves_transcript_and_updates_status(self):
        """Test that transcript is saved and status is updated"""
        srt_content = "1\n00:00:00,000 --> 00:00:05,000\nHello world\n"

        save_transcription_result(self.video, srt_content)

        self.video.refresh_from_db()
        self.assertEqual(self.video.status, "completed")
        self.assertEqual(self.video.transcript, srt_content)

    def test_clears_error_message(self):
        """Test that error message is cleared on success"""
        self.video.error_message = "Previous error"
        self.video.save()

        save_transcription_result(self.video, "test transcript")

        self.video.refresh_from_db()
        self.assertEqual(self.video.error_message, "")


class HandleTranscriptionErrorTests(TestCase):
    """Tests for handle_transcription_error function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="processing",
        )

    def test_sets_error_status_and_message(self):
        """Test that error status and message are set"""
        error_msg = "Transcription failed"

        handle_transcription_error(self.video, error_msg)

        self.video.refresh_from_db()
        self.assertEqual(self.video.status, "error")
        self.assertEqual(self.video.error_message, error_msg)


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

    @patch("app.tasks.transcription.index_scenes_batch")
    @patch("app.tasks.transcription.apply_scene_splitting")
    @patch("app.tasks.transcription.transcribe_and_create_srt")
    @patch("app.tasks.transcription.extract_and_split_audio")
    @patch("app.tasks.transcription.download_video_from_storage")
    @patch("app.tasks.transcription.create_whisper_client")
    @patch("app.tasks.transcription.get_whisper_model_name")
    @patch("app.tasks.transcription.WhisperConfig")
    @patch("app.tasks.transcription.VideoTaskManager.validate_video_for_processing", return_value=(True, None))
    def test_successful_transcription_pipeline(
        self,
        mock_validate,
        mock_whisper_config,
        mock_get_model,
        mock_create_client,
        mock_download,
        mock_extract,
        mock_transcribe,
        mock_scene_split,
        mock_index,
    ):
        """Test successful transcription pipeline"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="pending",
        )

        # Setup mocks
        mock_get_model.return_value = "whisper-1"
        mock_download.return_value = ("/tmp/video.mp4", MagicMock())
        mock_extract.return_value = [
            {"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}
        ]
        mock_transcribe.return_value = "1\n00:00:00,000 --> 00:00:10,000\nHello\n"
        mock_scene_split.return_value = ("1\n00:00:00,000 --> 00:00:10,000\nHello\n", 1)

        result = transcribe_video(video.id)

        video.refresh_from_db()
        self.assertEqual(video.status, "completed")
        self.assertIsNotNone(result)

    @patch("app.tasks.transcription.extract_and_split_audio")
    @patch("app.tasks.transcription.download_video_from_storage")
    @patch("app.tasks.transcription.create_whisper_client")
    @patch("app.tasks.transcription.get_whisper_model_name")
    @patch("app.tasks.transcription.WhisperConfig")
    @patch("app.tasks.transcription.VideoTaskManager.validate_video_for_processing", return_value=(True, None))
    def test_handles_empty_audio_segments(
        self,
        mock_validate,
        mock_whisper_config,
        mock_get_model,
        mock_create_client,
        mock_download,
        mock_extract,
    ):
        """Test that empty audio segments result in error status"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="pending",
        )

        mock_get_model.return_value = "whisper-1"
        mock_download.return_value = ("/tmp/video.mp4", MagicMock())
        mock_extract.return_value = []

        transcribe_video(video.id)

        video.refresh_from_db()
        self.assertEqual(video.status, "error")
        self.assertIn("Failed to extract audio", video.error_message)

    @patch("app.tasks.transcription.transcribe_and_create_srt")
    @patch("app.tasks.transcription.extract_and_split_audio")
    @patch("app.tasks.transcription.download_video_from_storage")
    @patch("app.tasks.transcription.create_whisper_client")
    @patch("app.tasks.transcription.get_whisper_model_name")
    @patch("app.tasks.transcription.WhisperConfig")
    @patch("app.tasks.transcription.VideoTaskManager.validate_video_for_processing", return_value=(True, None))
    def test_handles_transcription_failure(
        self,
        mock_validate,
        mock_whisper_config,
        mock_get_model,
        mock_create_client,
        mock_download,
        mock_extract,
        mock_transcribe,
    ):
        """Test that transcription failure results in error status"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="pending",
        )

        mock_get_model.return_value = "whisper-1"
        mock_download.return_value = ("/tmp/video.mp4", MagicMock())
        mock_extract.return_value = [
            {"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}
        ]
        mock_transcribe.return_value = None

        transcribe_video(video.id)

        video.refresh_from_db()
        self.assertEqual(video.status, "error")
        self.assertIn("Failed to transcribe", video.error_message)

    def test_handles_nonexistent_video(self):
        """Test handling of non-existent video ID"""
        with self.assertRaises(Exception):
            transcribe_video(99999)

    @patch("app.tasks.transcription.index_scenes_batch")
    @patch("app.tasks.transcription.apply_scene_splitting")
    @patch("app.tasks.transcription.transcribe_and_create_srt")
    @patch("app.tasks.transcription.extract_and_split_audio")
    @patch("app.tasks.transcription.download_video_from_storage")
    @patch("app.tasks.transcription.create_whisper_client")
    @patch("app.tasks.transcription.get_whisper_model_name")
    @patch("app.tasks.transcription.WhisperConfig")
    @patch("app.tasks.transcription.VideoTaskManager.validate_video_for_processing", return_value=(True, None))
    def test_external_id_triggers_file_cleanup(
        self,
        mock_validate,
        mock_whisper_config,
        mock_get_model,
        mock_create_client,
        mock_download,
        mock_extract,
        mock_transcribe,
        mock_scene_split,
        mock_index,
    ):
        """Test that external_id triggers file cleanup after processing"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="pending",
            external_id="ext-123",
        )

        mock_file = MagicMock()
        mock_get_model.return_value = "whisper-1"
        mock_download.return_value = ("/tmp/video.mp4", mock_file)
        mock_extract.return_value = [
            {"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}
        ]
        mock_transcribe.return_value = "1\n00:00:00,000 --> 00:00:10,000\nHello\n"
        mock_scene_split.return_value = ("1\n00:00:00,000 --> 00:00:10,000\nHello\n", 1)

        transcribe_video(video.id)

        mock_file.delete.assert_called_once_with(save=False)

    @patch("app.tasks.transcription.index_scenes_batch")
    @patch("app.tasks.transcription.apply_scene_splitting")
    @patch("app.tasks.transcription.transcribe_and_create_srt")
    @patch("app.tasks.transcription.extract_and_split_audio")
    @patch("app.tasks.transcription.download_video_from_storage")
    @patch("app.tasks.transcription.create_whisper_client")
    @patch("app.tasks.transcription.get_whisper_model_name")
    @patch("app.tasks.transcription.WhisperConfig")
    @patch("app.tasks.transcription.VideoTaskManager.validate_video_for_processing", return_value=(True, None))
    def test_no_external_id_keeps_file(
        self,
        mock_validate,
        mock_whisper_config,
        mock_get_model,
        mock_create_client,
        mock_download,
        mock_extract,
        mock_transcribe,
        mock_scene_split,
        mock_index,
    ):
        """Test that videos without external_id keep their files"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="pending",
            external_id=None,
        )

        mock_file = MagicMock()
        mock_get_model.return_value = "whisper-1"
        mock_download.return_value = ("/tmp/video.mp4", mock_file)
        mock_extract.return_value = [
            {"path": "/tmp/audio.mp3", "start_time": 0, "end_time": 10}
        ]
        mock_transcribe.return_value = "1\n00:00:00,000 --> 00:00:10,000\nHello\n"
        mock_scene_split.return_value = ("1\n00:00:00,000 --> 00:00:10,000\nHello\n", 1)

        transcribe_video(video.id)

        mock_file.delete.assert_not_called()

    @patch("app.tasks.transcription.VideoTaskManager.validate_video_for_processing")
    @patch("app.tasks.transcription.VideoTaskManager.get_video_with_user")
    def test_invalid_video_raises_error(self, mock_get_video, mock_validate):
        """Test that invalid video raises error"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="pending",
        )

        mock_get_video.return_value = (video, None)
        mock_validate.return_value = (False, "Video has no file")

        with self.assertRaises(ValueError):
            transcribe_video(video.id)
