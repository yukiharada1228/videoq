"""
Tests for query_optimizer module
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.models import Video, VideoGroup, VideoGroupMember
from app.utils.query_optimizer import (BatchProcessor, CacheOptimizer,
                                       QueryOptimizer)

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


class BatchProcessorTests(TestCase):
    """Tests for BatchProcessor class"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.video1 = Video.objects.create(
            user=self.user,
            title="Video 1",
            description="Description 1",
            status="pending",
        )
        self.video2 = Video.objects.create(
            user=self.user,
            title="Video 2",
            description="Description 2",
            status="pending",
        )
        self.group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )

    def test_bulk_update_videos(self):
        """Test bulk_update_videos"""
        self.video1.status = "completed"
        self.video2.status = "completed"

        count = BatchProcessor.bulk_update_videos(
            [self.video1, self.video2], ["status"]
        )

        self.assertEqual(count, 2)
        self.video1.refresh_from_db()
        self.video2.refresh_from_db()
        self.assertEqual(self.video1.status, "completed")
        self.assertEqual(self.video2.status, "completed")

    def test_bulk_update_videos_empty_list(self):
        """Test bulk_update_videos with empty list"""
        count = BatchProcessor.bulk_update_videos([], ["status"])

        self.assertEqual(count, 0)

    def test_bulk_create_video_group_members(self):
        """Test bulk_create_video_group_members"""
        members = BatchProcessor.bulk_create_video_group_members(
            self.group.id, [self.video1.id, self.video2.id]
        )

        self.assertEqual(len(members), 2)
        self.assertEqual(VideoGroupMember.objects.count(), 2)

    def test_bulk_create_video_group_members_with_orders(self):
        """Test bulk_create_video_group_members with orders"""
        members = BatchProcessor.bulk_create_video_group_members(
            self.group.id, [self.video1.id, self.video2.id], orders=[10, 20]
        )

        self.assertEqual(len(members), 2)
        member1 = VideoGroupMember.objects.get(video=self.video1)
        member2 = VideoGroupMember.objects.get(video=self.video2)
        self.assertEqual(member1.order, 10)
        self.assertEqual(member2.order, 20)

    def test_bulk_create_video_group_members_empty_list(self):
        """Test bulk_create_video_group_members with empty list"""
        members = BatchProcessor.bulk_create_video_group_members(self.group.id, [])

        self.assertEqual(len(members), 0)

    def test_bulk_delete_video_group_members(self):
        """Test bulk_delete_video_group_members"""
        VideoGroupMember.objects.create(group=self.group, video=self.video1, order=0)
        VideoGroupMember.objects.create(group=self.group, video=self.video2, order=1)

        count = BatchProcessor.bulk_delete_video_group_members(
            self.group.id, [self.video1.id, self.video2.id]
        )

        self.assertEqual(count, 2)
        self.assertEqual(VideoGroupMember.objects.count(), 0)

    def test_bulk_delete_video_group_members_empty_list(self):
        """Test bulk_delete_video_group_members with empty list"""
        count = BatchProcessor.bulk_delete_video_group_members(self.group.id, [])

        self.assertEqual(count, 0)


class CacheOptimizerTests(TestCase):
    """Tests for CacheOptimizer class"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.video1 = Video.objects.create(
            user=self.user,
            title="Video 1",
            description="Description 1",
            status="completed",
        )
        self.video2 = Video.objects.create(
            user=self.user,
            title="Video 2",
            description="Description 2",
            status="pending",
        )
        self.group1 = VideoGroup.objects.create(
            user=self.user, name="Group 1", description="Description 1"
        )
        self.group2 = VideoGroup.objects.create(
            user=self.user, name="Group 2", description="Description 2"
        )

    def test_get_cached_video_data(self):
        """Test get_cached_video_data"""
        data = CacheOptimizer.get_cached_video_data([self.video1.id, self.video2.id])

        self.assertEqual(len(data), 2)
        self.assertIn(self.video1.id, data)
        self.assertIn(self.video2.id, data)
        self.assertEqual(data[self.video1.id]["title"], "Video 1")
        self.assertEqual(data[self.video2.id]["title"], "Video 2")

    def test_get_cached_video_data_empty_list(self):
        """Test get_cached_video_data with empty list"""
        data = CacheOptimizer.get_cached_video_data([])

        self.assertEqual(data, {})

    def test_get_cached_video_group_data(self):
        """Test get_cached_video_group_data"""
        VideoGroupMember.objects.create(group=self.group1, video=self.video1, order=0)
        VideoGroupMember.objects.create(group=self.group2, video=self.video2, order=0)

        data = CacheOptimizer.get_cached_video_group_data(
            [self.group1.id, self.group2.id]
        )

        self.assertEqual(len(data), 2)
        self.assertIn(self.group1.id, data)
        self.assertIn(self.group2.id, data)
        self.assertEqual(data[self.group1.id]["name"], "Group 1")
        self.assertEqual(data[self.group2.id]["name"], "Group 2")
        self.assertEqual(data[self.group1.id]["video_count"], 1)

    def test_get_cached_video_group_data_empty_list(self):
        """Test get_cached_video_group_data with empty list"""
        data = CacheOptimizer.get_cached_video_group_data([])

        self.assertEqual(data, {})

    def test_prefetch_related_data(self):
        """Test prefetch_related_data"""
        queryset = Video.objects.all()
        optimized = CacheOptimizer.prefetch_related_data(queryset, ["user"])

        video = optimized.first()
        self.assertIsNotNone(video)
        # Should not cause additional query when accessing user
        with self.assertNumQueries(0):
            _ = video.user

    def test_prefetch_related_data_empty_fields(self):
        """Test prefetch_related_data with empty fields"""
        queryset = Video.objects.all()
        optimized = CacheOptimizer.prefetch_related_data(queryset, [])

        self.assertEqual(optimized.count(), queryset.count())

    def test_optimize_bulk_operations_update(self):
        """Test optimize_bulk_operations for update"""
        queryset = Video.objects.all()
        optimized = CacheOptimizer.optimize_bulk_operations(queryset, "update")

        video = optimized.first()
        self.assertIsNotNone(video)

    def test_optimize_bulk_operations_delete(self):
        """Test optimize_bulk_operations for delete"""
        queryset = Video.objects.all()
        optimized = CacheOptimizer.optimize_bulk_operations(queryset, "delete")

        video = optimized.first()
        self.assertIsNotNone(video)

    def test_optimize_bulk_operations_create(self):
        """Test optimize_bulk_operations for create"""
        queryset = Video.objects.all()
        optimized = CacheOptimizer.optimize_bulk_operations(queryset, "create")

        self.assertEqual(optimized.count(), queryset.count())

    def test_optimize_bulk_operations_invalid(self):
        """Test optimize_bulk_operations with invalid operation"""
        queryset = Video.objects.all()
        optimized = CacheOptimizer.optimize_bulk_operations(queryset, "invalid")

        self.assertEqual(optimized.count(), queryset.count())

    def test_get_optimized_count_queryset(self):
        """Test get_optimized_count_queryset"""
        queryset = CacheOptimizer.get_optimized_count_queryset(Video)

        self.assertIsNotNone(queryset)
        self.assertGreaterEqual(queryset.count(), 0)

    def test_get_optimized_count_queryset_with_filters(self):
        """Test get_optimized_count_queryset with filters"""
        queryset = CacheOptimizer.get_optimized_count_queryset(
            Video, filters={"status": "completed"}
        )

        self.assertIsNotNone(queryset)
        self.assertEqual(queryset.count(), 1)
