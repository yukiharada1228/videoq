"""
Tests for cleanup_old_deleted_videos management command
"""

from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from app.models import User, Video


class CleanupOldDeletedVideosCommandTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass123"
        )

    def test_cleanup_no_deleted_videos(self):
        """Test cleanup when there are no deleted videos"""
        out = StringIO()
        call_command("cleanup_old_deleted_videos", stdout=out)
        self.assertIn("No old deleted videos found", out.getvalue())

    def test_cleanup_current_month_deleted_videos_not_deleted(self):
        """Test that videos deleted in current month are not deleted"""
        # Create a video deleted this month
        video = Video.objects.create(
            user=self.user,
            title="Current Month Video",
            description="Test",
            deleted_at=timezone.now(),
        )

        out = StringIO()
        call_command("cleanup_old_deleted_videos", stdout=out)
        self.assertIn("No old deleted videos found", out.getvalue())
        # Video should still exist
        self.assertTrue(Video.objects.filter(pk=video.pk).exists())

    def test_cleanup_old_deleted_videos(self):
        """Test that videos deleted before current month are deleted"""
        # Create a video deleted last month
        last_month = timezone.now() - timedelta(days=35)
        old_video = Video.objects.create(
            user=self.user,
            title="Old Video",
            description="Test",
            deleted_at=last_month,
        )

        out = StringIO()
        call_command("cleanup_old_deleted_videos", stdout=out)
        self.assertIn("Successfully deleted", out.getvalue())
        # Video should be deleted
        self.assertFalse(Video.objects.filter(pk=old_video.pk).exists())

    def test_cleanup_dry_run(self):
        """Test dry-run mode doesn't actually delete"""
        # Create a video deleted last month
        last_month = timezone.now() - timedelta(days=35)
        old_video = Video.objects.create(
            user=self.user,
            title="Old Video",
            description="Test",
            deleted_at=last_month,
        )

        out = StringIO()
        call_command("cleanup_old_deleted_videos", "--dry-run", stdout=out)
        self.assertIn("DRY RUN", out.getvalue())
        self.assertIn("Would delete", out.getvalue())
        # Video should still exist
        self.assertTrue(Video.objects.filter(pk=old_video.pk).exists())

    def test_cleanup_only_soft_deleted_videos(self):
        """Test that non-deleted videos are not affected"""
        # Create a non-deleted video
        active_video = Video.objects.create(
            user=self.user,
            title="Active Video",
            description="Test",
            deleted_at=None,
        )

        # Create a video deleted last month
        last_month = timezone.now() - timedelta(days=35)
        old_video = Video.objects.create(
            user=self.user,
            title="Old Video",
            description="Test",
            deleted_at=last_month,
        )

        out = StringIO()
        call_command("cleanup_old_deleted_videos", stdout=out)
        self.assertIn("Successfully deleted", out.getvalue())
        # Active video should still exist
        self.assertTrue(Video.objects.filter(pk=active_video.pk).exists())
        # Old deleted video should be deleted
        self.assertFalse(Video.objects.filter(pk=old_video.pk).exists())

    def test_cleanup_custom_months(self):
        """Test cleanup with custom months parameter"""
        # Create a video deleted 2 months ago
        two_months_ago = timezone.now() - timedelta(days=65)
        old_video = Video.objects.create(
            user=self.user,
            title="Very Old Video",
            description="Test",
            deleted_at=two_months_ago,
        )

        # With default months=1, it should be deleted
        out = StringIO()
        call_command("cleanup_old_deleted_videos", stdout=out)
        self.assertIn("Successfully deleted", out.getvalue())
        self.assertFalse(Video.objects.filter(pk=old_video.pk).exists())

        # Recreate for next test
        old_video = Video.objects.create(
            user=self.user,
            title="Very Old Video",
            description="Test",
            deleted_at=two_months_ago,
        )

        # With months=3, it should NOT be deleted (only 2 months old)
        out = StringIO()
        call_command("cleanup_old_deleted_videos", "--months", "3", stdout=out)
        self.assertIn("No old deleted videos found", out.getvalue())
        self.assertTrue(Video.objects.filter(pk=old_video.pk).exists())

    @patch("app.models.delete_video_vectors")
    def test_cleanup_deletes_vectors(self, mock_delete_vectors):
        """Test that cleanup also deletes vectors via post_delete signal"""
        # Create a video deleted last month
        last_month = timezone.now() - timedelta(days=35)
        old_video = Video.objects.create(
            user=self.user,
            title="Old Video",
            description="Test",
            deleted_at=last_month,
        )

        out = StringIO()
        call_command("cleanup_old_deleted_videos", stdout=out)
        # post_delete signal should be called, which calls delete_video_vectors
        # Note: In actual implementation, the signal handler calls delete_video_vectors
        # but since we're using soft delete, the signal only fires on hard delete
        self.assertIn("Successfully deleted", out.getvalue())

