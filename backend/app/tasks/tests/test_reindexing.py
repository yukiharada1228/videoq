"""
Tests for reindexing task
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.models import Video
from app.tasks.reindexing import reindex_all_videos_embeddings

User = get_user_model()


class ReindexAllVideosEmbeddingsTests(TestCase):
    """Tests for reindex_all_videos_embeddings task"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    @patch("app.tasks.reindexing.index_scenes_batch")
    @patch("app.tasks.reindexing.delete_all_vectors")
    def test_reindexes_completed_videos(self, mock_delete, mock_index):
        """Test that completed videos with transcripts are reindexed"""
        mock_delete.return_value = 10

        # Create videos with different statuses
        Video.objects.create(
            user=self.user,
            title="Completed Video",
            status="completed",
            transcript="1\n00:00:00,000 --> 00:00:05,000\nHello\n",
        )
        Video.objects.create(
            user=self.user,
            title="Pending Video",
            status="pending",
            transcript="",
        )
        Video.objects.create(
            user=self.user,
            title="Processing Video",
            status="processing",
            transcript="",
        )

        result = reindex_all_videos_embeddings()

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["total_videos"], 1)
        self.assertEqual(result["successful_count"], 1)
        self.assertEqual(result["failed_count"], 0)

    @patch("app.tasks.reindexing.index_scenes_batch")
    @patch("app.tasks.reindexing.delete_all_vectors")
    def test_skips_videos_without_transcript(self, mock_delete, mock_index):
        """Test that videos without transcripts are skipped"""
        mock_delete.return_value = 0

        Video.objects.create(
            user=self.user,
            title="No Transcript",
            status="completed",
            transcript="",
        )
        Video.objects.create(
            user=self.user,
            title="Empty Transcript",
            status="completed",
            transcript="",
        )

        result = reindex_all_videos_embeddings()

        self.assertEqual(result["total_videos"], 0)
        mock_index.assert_not_called()

    @patch("app.tasks.reindexing.index_scenes_batch")
    @patch("app.tasks.reindexing.delete_all_vectors")
    def test_handles_empty_video_set(self, mock_delete, mock_index):
        """Test handling of no videos to reindex"""
        mock_delete.return_value = 0

        result = reindex_all_videos_embeddings()

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["total_videos"], 0)
        self.assertEqual(result["message"], "No videos to re-index")

    @patch("app.tasks.reindexing.index_scenes_batch")
    @patch("app.tasks.reindexing.delete_all_vectors")
    def test_continues_on_individual_video_error(self, mock_delete, mock_index):
        """Test that processing continues when individual video fails"""
        mock_delete.return_value = 10

        # First call fails, second succeeds
        mock_index.side_effect = [Exception("Index failed"), None]

        Video.objects.create(
            user=self.user,
            title="Video 1",
            status="completed",
            transcript="transcript 1",
        )
        Video.objects.create(
            user=self.user,
            title="Video 2",
            status="completed",
            transcript="transcript 2",
        )

        result = reindex_all_videos_embeddings()

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["total_videos"], 2)
        self.assertEqual(result["successful_count"], 1)
        self.assertEqual(result["failed_count"], 1)
        self.assertEqual(len(result["failed_videos"]), 1)

    @patch("app.tasks.reindexing.index_scenes_batch")
    @patch("app.tasks.reindexing.delete_all_vectors")
    def test_deletes_all_vectors_before_reindexing(self, mock_delete, mock_index):
        """Test that all vectors are deleted before reindexing"""
        mock_delete.return_value = 50

        Video.objects.create(
            user=self.user,
            title="Video",
            status="completed",
            transcript="transcript",
        )

        reindex_all_videos_embeddings()

        mock_delete.assert_called_once()
        # Delete should be called before index
        self.assertTrue(mock_delete.call_count == 1)

    @patch("app.tasks.reindexing.delete_all_vectors")
    def test_handles_delete_error(self, mock_delete):
        """Test handling of delete_all_vectors error"""
        mock_delete.side_effect = Exception("Delete failed")

        Video.objects.create(
            user=self.user,
            title="Video",
            status="completed",
            transcript="transcript",
        )

        result = reindex_all_videos_embeddings()

        self.assertEqual(result["status"], "failed")
        self.assertIn("Delete failed", result["error"])

    @patch("app.tasks.reindexing.index_scenes_batch")
    @patch("app.tasks.reindexing.delete_all_vectors")
    def test_reports_failed_videos_details(self, mock_delete, mock_index):
        """Test that failed video details are included in result"""
        mock_delete.return_value = 0
        mock_index.side_effect = Exception("Specific error message")

        video = Video.objects.create(
            user=self.user,
            title="Failing Video",
            status="completed",
            transcript="transcript",
        )

        result = reindex_all_videos_embeddings()

        self.assertEqual(len(result["failed_videos"]), 1)
        self.assertEqual(result["failed_videos"][0]["video_id"], video.id)
        self.assertEqual(result["failed_videos"][0]["title"], "Failing Video")
        self.assertIn("Specific error message", result["failed_videos"][0]["error"])

    @patch("app.tasks.reindexing.index_scenes_batch")
    @patch("app.tasks.reindexing.delete_all_vectors")
    def test_result_message_format(self, mock_delete, mock_index):
        """Test that result message has correct format"""
        mock_delete.return_value = 0

        for i in range(5):
            Video.objects.create(
                user=self.user,
                title=f"Video {i}",
                status="completed",
                transcript=f"transcript {i}",
            )

        result = reindex_all_videos_embeddings()

        self.assertEqual(result["message"], "Re-indexed 5/5 videos")
