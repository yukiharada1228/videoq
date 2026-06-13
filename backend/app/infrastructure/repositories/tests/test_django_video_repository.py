"""Integration tests for DjangoVideoRepository tag filtering."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.domain.video.dto import CreateGroupParams, VideoSearchCriteria
from app.infrastructure.models import Tag, Video, VideoGroup, VideoTag
from app.infrastructure.repositories.django_video_repository import (
    DjangoVideoGroupRepository,
    DjangoVideoRepository,
)

User = get_user_model()


class DjangoVideoRepositoryTagFilterTests(TestCase):
    """Tests for tag filtering behavior in list_for_user."""

    def setUp(self):
        self.repo = DjangoVideoRepository()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.tag_a = Tag.objects.create(user=self.user, name="TagA")
        self.tag_b = Tag.objects.create(user=self.user, name="TagB")
        self.tag_c = Tag.objects.create(user=self.user, name="TagC")

        self.video_a = Video.objects.create(user=self.user, title="Video A", status="completed")
        self.video_b = Video.objects.create(user=self.user, title="Video B", status="completed")
        self.video_ab = Video.objects.create(user=self.user, title="Video AB", status="completed")

        VideoTag.objects.create(video=self.video_a, tag=self.tag_a)
        VideoTag.objects.create(video=self.video_b, tag=self.tag_b)
        VideoTag.objects.create(video=self.video_ab, tag=self.tag_a)
        VideoTag.objects.create(video=self.video_ab, tag=self.tag_b)

    def test_single_tag_filter_returns_videos_with_that_tag(self):
        criteria = VideoSearchCriteria(tag_ids=[self.tag_a.id])
        results = self.repo.list_for_user(self.user.id, criteria)
        titles = {v.title for v in results}
        self.assertIn("Video A", titles)
        self.assertIn("Video AB", titles)
        self.assertNotIn("Video B", titles)

    def test_multiple_tag_filter_returns_videos_with_any_tag_or_logic(self):
        """複数タグ選択時はORロジック（いずれかのタグを持つ動画）で返すこと"""
        criteria = VideoSearchCriteria(tag_ids=[self.tag_a.id, self.tag_b.id])
        results = self.repo.list_for_user(self.user.id, criteria)
        titles = {v.title for v in results}
        self.assertIn("Video A", titles)
        self.assertIn("Video B", titles)
        self.assertIn("Video AB", titles)

    def test_multiple_tag_filter_no_duplicates(self):
        """ORロジックでも重複動画が返らないこと（distinct）"""
        criteria = VideoSearchCriteria(tag_ids=[self.tag_a.id, self.tag_b.id])
        results = self.repo.list_for_user(self.user.id, criteria)
        ids = [v.id for v in results]
        self.assertEqual(len(ids), len(set(ids)))

    def test_tag_filter_with_no_matching_tag_returns_empty(self):
        criteria = VideoSearchCriteria(tag_ids=[self.tag_c.id])
        results = self.repo.list_for_user(self.user.id, criteria)
        self.assertEqual(results, [])

    def test_no_tag_filter_returns_all_videos(self):
        results = self.repo.list_for_user(self.user.id, VideoSearchCriteria())
        self.assertEqual(len(results), 3)


class DjangoVideoGroupRepositoryOrderTests(TestCase):
    """Tests for video group display ordering behavior."""

    def setUp(self):
        self.repo = DjangoVideoGroupRepository()
        self.user = User.objects.create_user(
            username="grouporder",
            email="grouporder@example.com",
            password="testpass123",
        )
        self.group1 = VideoGroup.objects.create(
            user=self.user, name="Group 1", display_order=0
        )
        self.group2 = VideoGroup.objects.create(
            user=self.user, name="Group 2", display_order=1
        )
        self.group3 = VideoGroup.objects.create(
            user=self.user, name="Group 3", display_order=2
        )

    def test_list_for_user_uses_display_order(self):
        groups = self.repo.list_for_user(self.user.id)

        self.assertEqual(
            [group.id for group in groups],
            [self.group1.id, self.group2.id, self.group3.id],
        )

    def test_create_group_appends_after_existing_groups(self):
        group = self.repo.create(
            self.user.id,
            CreateGroupParams(name="Group 4", description=""),
        )

        self.assertEqual(group.display_order, 3)

    def test_reorder_groups_reuses_existing_slots_for_subset(self):
        self.repo.reorder_groups(self.user.id, [self.group3.id, self.group2.id])

        groups = self.repo.list_for_user(self.user.id)
        self.assertEqual(
            [group.id for group in groups],
            [self.group1.id, self.group3.id, self.group2.id],
        )
