"""
Tests for model signals
"""

import time
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.models import Video, VideoGroup, VideoGroupMember
from app.models.signals import _should_delete_videos

User = get_user_model()


class ShouldDeleteVideosTests(TestCase):
    """Tests for _should_delete_videos helper function"""

    def test_no_change_returns_false(self):
        """Test that no change returns False"""
        self.assertFalse(_should_delete_videos(5, 5))
        self.assertFalse(_should_delete_videos(None, None))
        self.assertFalse(_should_delete_videos(0, 0))

    def test_change_to_unlimited_returns_false(self):
        """Test that changing to unlimited returns False"""
        self.assertFalse(_should_delete_videos(5, None))
        self.assertFalse(_should_delete_videos(0, None))

    def test_unlimited_to_limited_returns_true(self):
        """Test that unlimited to limited returns True"""
        self.assertTrue(_should_delete_videos(None, 5))
        self.assertTrue(_should_delete_videos(None, 0))

    def test_limited_to_more_limited_returns_true(self):
        """Test that reducing limit returns True"""
        self.assertTrue(_should_delete_videos(10, 5))
        self.assertTrue(_should_delete_videos(5, 0))

    def test_limited_to_less_limited_returns_false(self):
        """Test that increasing limit returns False"""
        self.assertFalse(_should_delete_videos(5, 10))
        self.assertFalse(_should_delete_videos(0, 5))


class DeleteVideoVectorsSignalTests(TestCase):
    """Tests for delete_video_vectors_signal"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
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


class HandleVideoLimitReductionSignalTests(TestCase):
    """Tests for handle_video_limit_reduction signal"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        # Create videos with staggered timestamps
        self.videos = []
        for i in range(5):
            video = Video.objects.create(
                user=self.user,
                title=f"Video {i}",
                status="completed",
            )
            self.videos.append(video)
            if i < 4:
                time.sleep(0.01)

    def test_new_user_creation_does_not_trigger(self):
        """Test that new user creation doesn't trigger deletion"""
        # Should not raise any errors
        new_user = User.objects.create_user(
            username="newuser",
            email="new@example.com",
            password="testpass123",
            video_limit=5,
        )

        self.assertEqual(new_user.video_limit, 5)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_deletes_oldest_videos_first(self, mock_delete):
        """Test that oldest videos are deleted first"""
        self.assertEqual(Video.objects.filter(user=self.user).count(), 5)

        self.user.video_limit = 2
        self.user.save()

        # Should have 2 videos remaining
        remaining = Video.objects.filter(user=self.user)
        self.assertEqual(remaining.count(), 2)

        # Newest 2 should remain
        remaining_ids = list(remaining.values_list("id", flat=True))
        self.assertIn(self.videos[3].id, remaining_ids)
        self.assertIn(self.videos[4].id, remaining_ids)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_keeps_correct_number_of_videos(self, mock_delete):
        """Test that correct number of videos is kept"""
        self.user.video_limit = 3
        self.user.save()

        self.assertEqual(Video.objects.filter(user=self.user).count(), 3)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_unlimited_to_limited_deletes_excess(self, mock_delete):
        """Test that going from unlimited to limited deletes excess"""
        self.assertEqual(Video.objects.filter(user=self.user).count(), 5)

        self.user.video_limit = 3
        self.user.save()

        self.assertEqual(Video.objects.filter(user=self.user).count(), 3)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_limited_to_more_limited_deletes_excess(self, mock_delete):
        """Test that reducing limit deletes excess"""
        self.user.video_limit = 5
        self.user.save()

        self.user.video_limit = 2
        self.user.save()

        self.assertEqual(Video.objects.filter(user=self.user).count(), 2)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_reduce_to_zero_deletes_all(self, mock_delete):
        """Test that reducing to 0 deletes all videos"""
        self.user.video_limit = 0
        self.user.save()

        self.assertEqual(Video.objects.filter(user=self.user).count(), 0)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_increase_limit_does_not_delete(self, mock_delete):
        """Test that increasing limit doesn't delete videos"""
        self.user.video_limit = 3
        self.user.save()

        self.assertEqual(Video.objects.filter(user=self.user).count(), 3)

        self.user.video_limit = 10
        self.user.save()

        self.assertEqual(Video.objects.filter(user=self.user).count(), 3)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_change_to_unlimited_does_not_delete(self, mock_delete):
        """Test that changing to unlimited doesn't delete videos"""
        self.user.video_limit = 3
        self.user.save()

        self.assertEqual(Video.objects.filter(user=self.user).count(), 3)

        self.user.video_limit = None
        self.user.save()

        self.assertEqual(Video.objects.filter(user=self.user).count(), 3)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_same_limit_does_not_delete(self, mock_delete):
        """Test that setting same limit doesn't delete videos"""
        self.user.video_limit = 5
        self.user.save()

        mock_delete.reset_mock()

        self.user.video_limit = 5
        self.user.save()

        mock_delete.assert_not_called()

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_triggers_vector_cleanup(self, mock_delete):
        """Test that deletion triggers vector cleanup via signal"""
        self.user.video_limit = 2
        self.user.save()

        # 3 videos should be deleted
        self.assertEqual(mock_delete.call_count, 3)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_removes_videos_from_groups(self, mock_delete):
        """Test that deleted videos are removed from groups"""
        group = VideoGroup.objects.create(user=self.user, name="Test Group")
        for video in self.videos:
            VideoGroupMember.objects.create(group=group, video=video)

        self.assertEqual(VideoGroupMember.objects.filter(group=group).count(), 5)

        self.user.video_limit = 2
        self.user.save()

        self.assertEqual(VideoGroupMember.objects.filter(group=group).count(), 2)
        # Group should still exist
        self.assertTrue(VideoGroup.objects.filter(pk=group.pk).exists())

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_admin_update_works(self, mock_delete):
        """Test that admin-style updates work correctly"""
        # Simulate admin update
        user = User.objects.get(pk=self.user.pk)
        user.video_limit = 2
        user.save()

        self.assertEqual(Video.objects.filter(user=user).count(), 2)
