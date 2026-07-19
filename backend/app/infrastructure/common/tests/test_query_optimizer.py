"""
Tests for query_optimizer module
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.infrastructure.models import Video, VideoGroup, VideoGroupMember
from app.infrastructure.common.query_optimizer import QueryOptimizer

User = get_user_model()


class QueryOptimizerTests(TestCase):
    """Tests for QueryOptimizer class"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            description="Test Description",
            status="completed",
        )

    def test_optimize_video_queryset_with_user(self):
        """Test optimize_video_queryset with user"""
        queryset = Video.objects.all()
        optimized = QueryOptimizer.optimize_video_queryset(queryset, include_user=True)

        video = optimized.first()
        self.assertIsNotNone(video)
        # Should not cause additional query when accessing user
        with self.assertNumQueries(0):
            _ = video.user

    def test_optimize_video_queryset_without_user(self):
        """Test optimize_video_queryset without user"""
        queryset = Video.objects.all()
        optimized = QueryOptimizer.optimize_video_queryset(queryset, include_user=False)

        video = optimized.first()
        self.assertIsNotNone(video)

    def test_optimize_video_queryset_with_groups(self):
        """Test optimize_video_queryset with groups"""
        group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        VideoGroupMember.objects.create(group=group, video=self.video, order=0)

        queryset = Video.objects.all()
        optimized = QueryOptimizer.optimize_video_queryset(
            queryset, include_groups=True
        )

        video = optimized.first()
        self.assertIsNotNone(video)
        # Should not cause additional query when accessing groups
        with self.assertNumQueries(0):
            _ = list(video.groups.all())

    def test_optimize_video_queryset_with_transcript(self):
        """Test optimize_video_queryset with transcript"""
        queryset = Video.objects.all()
        optimized = QueryOptimizer.optimize_video_queryset(
            queryset, include_transcript=True
        )

        video = optimized.first()
        self.assertIsNotNone(video)

    def test_optimize_video_group_queryset_with_videos(self):
        """Test optimize_video_group_queryset with videos"""
        group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        VideoGroupMember.objects.create(group=group, video=self.video, order=0)

        queryset = VideoGroup.objects.all()
        optimized = QueryOptimizer.optimize_video_group_queryset(
            queryset, include_videos=True
        )

        group = optimized.first()
        self.assertIsNotNone(group)
        # Should not cause additional query when accessing members
        with self.assertNumQueries(0):
            _ = list(group.members.all())

    def test_optimize_video_group_queryset_with_video_count(self):
        """Test optimize_video_group_queryset with video count annotation"""
        group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        VideoGroupMember.objects.create(group=group, video=self.video, order=0)

        queryset = VideoGroup.objects.all()
        optimized = QueryOptimizer.optimize_video_group_queryset(
            queryset, annotate_video_count=True
        )

        group = optimized.first()
        self.assertIsNotNone(group)
        self.assertEqual(group.video_count, 1)

    def test_get_videos_with_metadata_with_user_id(self):
        """Test get_videos_with_metadata with user_id"""
        videos = QueryOptimizer.get_videos_with_metadata(user_id=self.user.id)

        self.assertEqual(videos.count(), 1)
        self.assertEqual(videos.first(), self.video)

    def test_get_videos_with_metadata_without_user_id(self):
        """Test get_videos_with_metadata without user_id"""
        videos = QueryOptimizer.get_videos_with_metadata(user_id=None)

        self.assertGreaterEqual(videos.count(), 1)
        self.assertIn(self.video, videos)

    def test_get_videos_with_metadata_with_status_filter(self):
        """Test get_videos_with_metadata with status filter"""
        videos = QueryOptimizer.get_videos_with_metadata(
            user_id=self.user.id, status_filter="completed"
        )

        self.assertEqual(videos.count(), 1)

        videos = QueryOptimizer.get_videos_with_metadata(
            user_id=self.user.id, status_filter="pending"
        )

        self.assertEqual(videos.count(), 0)

    def test_get_video_groups_with_videos(self):
        """Test get_video_groups_with_videos"""
        group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        VideoGroupMember.objects.create(group=group, video=self.video, order=0)

        groups = QueryOptimizer.get_video_groups_with_videos(user_id=self.user.id)

        self.assertEqual(groups.count(), 1)
        self.assertEqual(groups.first(), group)

