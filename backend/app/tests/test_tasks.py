"""
Tests for Celery tasks
"""

from datetime import timedelta
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from app.models import Video
from app.tasks import cleanup_soft_deleted_videos

User = get_user_model()


class CleanupSoftDeletedVideosTaskTests(TestCase):
    """Tests for cleanup_soft_deleted_videos task"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        # Create a mock task instance
        self.task_instance = Mock()

    def test_cleanup_deletes_videos_from_previous_month(self):
        """Test that videos deleted before current month are deleted"""
        # Create videos deleted in previous month
        now = timezone.now()
        previous_month = now.replace(day=1) - timedelta(days=1)
        previous_month_start = previous_month.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        # Video deleted in previous month (should be deleted)
        old_deleted_video = Video.objects.create(
            user=self.user,
            title="Old Deleted Video",
            deleted_at=previous_month_start + timedelta(days=5),
        )

        # Video deleted in current month (should NOT be deleted)
        current_month_start = now.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        current_deleted_video = Video.objects.create(
            user=self.user,
            title="Current Month Deleted Video",
            deleted_at=current_month_start + timedelta(days=1),
        )

        # Video not deleted (should NOT be deleted)
        active_video = Video.objects.create(
            user=self.user,
            title="Active Video",
            deleted_at=None,
        )

        # Run cleanup task
        result = cleanup_soft_deleted_videos(self.task_instance)

        # Check results
        self.assertEqual(result, 1)  # Only one video should be deleted
        self.assertFalse(Video.objects.filter(id=old_deleted_video.id).exists())
        self.assertTrue(Video.objects.filter(id=current_deleted_video.id).exists())
        self.assertTrue(Video.objects.filter(id=active_video.id).exists())

    def test_cleanup_deletes_videos_from_previous_year(self):
        """Test that videos deleted in previous year are deleted"""
        # Create video deleted in previous year
        now = timezone.now()
        previous_year = now.replace(month=1, day=1) - timedelta(days=1)
        old_deleted_video = Video.objects.create(
            user=self.user,
            title="Old Year Deleted Video",
            deleted_at=previous_year,
        )

        # Run cleanup task
        result = cleanup_soft_deleted_videos(self.task_instance)

        # Check results
        self.assertEqual(result, 1)
        self.assertFalse(Video.objects.filter(id=old_deleted_video.id).exists())

    def test_cleanup_handles_batch_processing(self):
        """Test that cleanup handles large numbers of videos in batches"""
        # Create 250 videos deleted in previous month (more than batch size of 100)
        now = timezone.now()
        previous_month = now.replace(day=1) - timedelta(days=1)
        previous_month_start = previous_month.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        videos = []
        for i in range(250):
            video = Video.objects.create(
                user=self.user,
                title=f"Old Video {i}",
                deleted_at=previous_month_start + timedelta(days=i % 28),
            )
            videos.append(video)

        # Run cleanup task
        result = cleanup_soft_deleted_videos(self.task_instance)

        # Check results
        self.assertEqual(result, 250)
        self.assertEqual(
            Video.objects.filter(deleted_at__lt=now.replace(day=1)).count(), 0
        )

    def test_cleanup_no_videos_to_delete(self):
        """Test cleanup when there are no videos to delete"""
        # Create only active videos
        Video.objects.create(
            user=self.user,
            title="Active Video 1",
            deleted_at=None,
        )
        Video.objects.create(
            user=self.user,
            title="Active Video 2",
            deleted_at=None,
        )

        # Run cleanup task
        result = cleanup_soft_deleted_videos(self.task_instance)

        # Check results
        self.assertEqual(result, 0)
        self.assertEqual(Video.objects.count(), 2)

    def test_cleanup_only_deletes_before_current_month(self):
        """Test that cleanup only deletes videos deleted before current month start"""
        now = timezone.now()
        current_month_start = now.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        # Video deleted exactly at current month start (should NOT be deleted)
        video_at_month_start = Video.objects.create(
            user=self.user,
            title="Video at Month Start",
            deleted_at=current_month_start,
        )

        # Video deleted just before current month start (should be deleted)
        video_before_month_start = Video.objects.create(
            user=self.user,
            title="Video Before Month Start",
            deleted_at=current_month_start - timedelta(seconds=1),
        )

        # Run cleanup task
        result = cleanup_soft_deleted_videos(self.task_instance)

        # Check results
        self.assertEqual(result, 1)
        self.assertTrue(Video.objects.filter(id=video_at_month_start.id).exists())
        self.assertFalse(Video.objects.filter(id=video_before_month_start.id).exists())

    @patch("app.tasks.logger")
    def test_cleanup_handles_individual_delete_errors(self, mock_logger):
        """Test that cleanup continues even if individual video deletion fails"""
        now = timezone.now()
        previous_month = now.replace(day=1) - timedelta(days=1)
        previous_month_start = previous_month.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        # Create videos to delete
        video1 = Video.objects.create(
            user=self.user,
            title="Video 1",
            deleted_at=previous_month_start + timedelta(days=1),
        )
        video2 = Video.objects.create(
            user=self.user,
            title="Video 2",
            deleted_at=previous_month_start + timedelta(days=2),
        )

        # Mock delete to fail for one video
        with patch.object(video1, "delete", side_effect=Exception("Delete error")):
            result = cleanup_soft_deleted_videos(self.task_instance)

        # Check that error was logged but task continued
        mock_logger.warning.assert_called()
        # One video should still be deleted
        self.assertEqual(result, 1)
        self.assertTrue(Video.objects.filter(id=video1.id).exists())
        self.assertFalse(Video.objects.filter(id=video2.id).exists())

    @patch("app.tasks.logger")
    def test_cleanup_handles_general_errors(self, mock_logger):
        """Test that cleanup raises exception on general errors for Celery retry"""
        # Mock Video.objects.filter to raise exception
        with patch.object(
            Video.objects, "filter", side_effect=Exception("Database error")
        ):
            with self.assertRaises(Exception):
                cleanup_soft_deleted_videos(self.task_instance)

        mock_logger.error.assert_called()

    def test_cleanup_with_multiple_users(self):
        """Test cleanup with videos from multiple users"""
        user2 = User.objects.create_user(
            username="testuser2",
            email="test2@example.com",
            password="testpass123",
        )

        now = timezone.now()
        previous_month = now.replace(day=1) - timedelta(days=1)
        previous_month_start = previous_month.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        # Create deleted videos for both users
        video1 = Video.objects.create(
            user=self.user,
            title="User1 Deleted Video",
            deleted_at=previous_month_start + timedelta(days=1),
        )
        video2 = Video.objects.create(
            user=user2,
            title="User2 Deleted Video",
            deleted_at=previous_month_start + timedelta(days=2),
        )

        # Run cleanup task
        result = cleanup_soft_deleted_videos(self.task_instance)

        # Check results - both should be deleted
        self.assertEqual(result, 2)
        self.assertFalse(Video.objects.filter(id=video1.id).exists())
        self.assertFalse(Video.objects.filter(id=video2.id).exists())
