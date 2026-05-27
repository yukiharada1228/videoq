"""Integration tests for DjangoVideoRepository tag filtering."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.domain.video.dto import VideoSearchCriteria
from app.infrastructure.models import Tag, Video, VideoTag
from app.infrastructure.repositories.django_video_repository import DjangoVideoRepository

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
