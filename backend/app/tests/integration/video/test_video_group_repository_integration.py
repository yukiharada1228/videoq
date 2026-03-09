"""Integration tests for DjangoVideoGroupRepository ownership boundaries."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.domain.video.entities import VideoGroupEntity
from app.infrastructure.models import Video, VideoGroup, VideoGroupMember
from app.infrastructure.repositories.django_video_repository import DjangoVideoGroupRepository

User = get_user_model()


class DjangoVideoGroupRepositoryIntegrationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="pass12345",
            video_limit=None,
        )
        self.other_user = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="pass12345",
            video_limit=None,
        )
        self.group = VideoGroup.objects.create(user=self.owner, name="Owner Group")
        self.repo = DjangoVideoGroupRepository()

    def test_add_videos_bulk_ignores_videos_not_owned_by_user(self):
        owner_video = Video.objects.create(user=self.owner, title="owner-video")
        foreign_video = Video.objects.create(user=self.other_user, title="foreign-video")
        group_entity = VideoGroupEntity(id=self.group.id, user_id=self.owner.id, name=self.group.name)

        added_count, skipped_count = self.repo.add_videos_bulk(
            group=group_entity,
            video_ids=[owner_video.id, foreign_video.id],
            user_id=self.owner.id,
        )

        self.assertEqual((added_count, skipped_count), (1, 1))
        self.assertTrue(
            VideoGroupMember.objects.filter(group=self.group, video=owner_video).exists()
        )
        self.assertFalse(
            VideoGroupMember.objects.filter(group=self.group, video=foreign_video).exists()
        )

    def test_add_videos_bulk_adds_all_owned_videos(self):
        video1 = Video.objects.create(user=self.owner, title="video-1")
        video2 = Video.objects.create(user=self.owner, title="video-2")
        group_entity = VideoGroupEntity(id=self.group.id, user_id=self.owner.id, name=self.group.name)

        added_count, skipped_count = self.repo.add_videos_bulk(
            group=group_entity,
            video_ids=[video1.id, video2.id],
            user_id=self.owner.id,
        )

        self.assertEqual((added_count, skipped_count), (2, 0))
        self.assertEqual(
            VideoGroupMember.objects.filter(group=self.group).count(),
            2,
        )
