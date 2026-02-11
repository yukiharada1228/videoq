"""
Tests for model signals
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.models import Video

User = get_user_model()


class DeleteVideoVectorsSignalTests(TestCase):
    """Tests for delete_video_vectors_signal"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_signal_calls_delete_video_vectors(self, mock_delete):
        """Test that signal calls delete_video_vectors on video deletion"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )
        video_id = video.id

        video.delete()

        mock_delete.assert_called_once_with(video_id)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_signal_handles_error_gracefully(self, mock_delete):
        """Test that signal handles errors gracefully"""
        mock_delete.side_effect = Exception("Delete failed")

        video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )

        # Should not raise, video should be deleted
        video.delete()

        self.assertFalse(Video.objects.filter(id=video.id).exists())
