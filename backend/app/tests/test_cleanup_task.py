"""
Tests for cleanup_old_deleted_videos_task Celery task
"""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from app.models import User, Video
from app.tasks import cleanup_old_deleted_videos_task


class CleanupOldDeletedVideosTaskTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )

    @patch("app.tasks.call_command")
    def test_cleanup_task_calls_command(self, mock_call_command):
        """Test that the Celery task calls the management command"""
        cleanup_old_deleted_videos_task()
        mock_call_command.assert_called_once_with("cleanup_old_deleted_videos")

    @patch("app.tasks.logger")
    @patch("app.tasks.call_command")
    def test_cleanup_task_logs_success(self, mock_call_command, mock_logger):
        """Test that the task logs success"""
        cleanup_old_deleted_videos_task()
        mock_logger.info.assert_any_call("Starting cleanup of old deleted video records...")
        mock_logger.info.assert_any_call(
            "Successfully completed cleanup of old deleted video records"
        )

    @patch("app.tasks.logger")
    @patch("app.tasks.call_command")
    def test_cleanup_task_logs_error(self, mock_call_command, mock_logger):
        """Test that the task logs errors"""
        mock_call_command.side_effect = Exception("Test error")
        with self.assertRaises(Exception):
            cleanup_old_deleted_videos_task()
        mock_logger.error.assert_called_once()
        self.assertIn("Failed to cleanup", str(mock_logger.error.call_args))

    def test_cleanup_task_actually_deletes(self):
        """Test that the task actually deletes old videos"""
        # Create a video deleted last month
        last_month = timezone.now() - timedelta(days=35)
        old_video = Video.objects.create(
            user=self.user,
            title="Old Video",
            description="Test",
            deleted_at=last_month,
        )

        # Run the task
        cleanup_old_deleted_videos_task()

        # Video should be deleted
        self.assertFalse(Video.objects.filter(pk=old_video.pk).exists())

