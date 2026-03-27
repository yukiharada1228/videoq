"""Integration tests for DjangoMediaRepository."""

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from app.infrastructure.models import Video, VideoGroup, VideoGroupMember
from app.infrastructure.repositories.django_media_repository import DjangoMediaRepository

User = get_user_model()


class DjangoMediaRepositoryTests(TestCase):
    def setUp(self):
        self.repo = DjangoMediaRepository()
        self.user = User.objects.create_user(
            username="mediauser",
            email="mediauser@example.com",
            password="pass1234",
        )
        self.video = Video.objects.create(
            user=self.user,
            file=SimpleUploadedFile("media.mp4", b"fake", content_type="video/mp4"),
            title="Media Video",
            description="",
        )

    def test_find_video_id_by_file_path_returns_video_id(self):
        path = self.video.file.name

        video_id = self.repo.find_video_id_by_file_path(path)

        self.assertEqual(video_id, self.video.id)

    def test_find_video_id_by_file_path_returns_none_for_unknown_path(self):
        video_id = self.repo.find_video_id_by_file_path("nonexistent/path.mp4")
        self.assertIsNone(video_id)

    def test_is_video_owned_by_user_returns_true_for_owner(self):
        result = self.repo.is_video_owned_by_user(self.video.id, self.user.pk)
        self.assertTrue(result)

    def test_is_video_owned_by_user_returns_false_for_other_user(self):
        other_user = User.objects.create_user(
            username="other", email="other@example.com", password="pass"
        )

        result = self.repo.is_video_owned_by_user(self.video.id, other_user.pk)

        self.assertFalse(result)

    def test_is_video_owned_by_user_returns_false_for_nonexistent_video(self):
        result = self.repo.is_video_owned_by_user(99999, self.user.pk)
        self.assertFalse(result)

    def test_is_video_in_group_returns_true_when_member(self):
        group = VideoGroup.objects.create(user=self.user, name="Test Group")
        VideoGroupMember.objects.create(group=group, video=self.video, order=0)

        result = self.repo.is_video_in_group(self.video.id, group.id)

        self.assertTrue(result)

    def test_is_video_in_group_returns_false_when_not_member(self):
        group = VideoGroup.objects.create(user=self.user, name="Empty Group")

        result = self.repo.is_video_in_group(self.video.id, group.id)

        self.assertFalse(result)

    def test_is_video_in_group_returns_false_for_nonexistent_group(self):
        result = self.repo.is_video_in_group(self.video.id, 99999)
        self.assertFalse(result)
