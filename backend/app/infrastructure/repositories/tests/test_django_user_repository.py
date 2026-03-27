"""Integration tests for DjangoUserRepository."""

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from app.infrastructure.models import Video
from app.infrastructure.repositories.django_user_repository import DjangoUserRepository

User = get_user_model()


class DjangoUserRepositoryGetByIdTests(TestCase):
    def setUp(self):
        self.repo = DjangoUserRepository()
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="pass1234",
        )

    def test_returns_entity_with_correct_fields(self):
        entity = self.repo.get_by_id(self.user.pk)

        self.assertIsNotNone(entity)
        self.assertEqual(entity.id, self.user.pk)
        self.assertEqual(entity.username, "testuser")
        self.assertEqual(entity.email, "testuser@example.com")
        self.assertTrue(entity.is_active)

    def test_returns_none_for_nonexistent_user(self):
        entity = self.repo.get_by_id(99999)
        self.assertIsNone(entity)

    def test_video_count_defaults_to_zero(self):
        entity = self.repo.get_by_id(self.user.pk)
        self.assertEqual(entity.video_count, 0)


class DjangoUserRepositoryGetWithVideoCountTests(TestCase):
    def setUp(self):
        self.repo = DjangoUserRepository()
        self.user = User.objects.create_user(
            username="countuser",
            email="countuser@example.com",
            password="pass1234",
        )

    def test_returns_zero_count_when_no_videos(self):
        entity = self.repo.get_with_video_count(self.user.pk)

        self.assertIsNotNone(entity)
        self.assertEqual(entity.video_count, 0)

    def test_returns_correct_count_with_videos(self):
        for i in range(3):
            Video.objects.create(
                user=self.user,
                file=SimpleUploadedFile(f"v{i}.mp4", b"x", content_type="video/mp4"),
                title=f"Video {i}",
                description="",
            )

        entity = self.repo.get_with_video_count(self.user.pk)

        self.assertEqual(entity.video_count, 3)

    def test_returns_none_for_nonexistent_user(self):
        entity = self.repo.get_with_video_count(99999)
        self.assertIsNone(entity)

    def test_entity_fields_are_mapped_correctly(self):
        entity = self.repo.get_with_video_count(self.user.pk)

        self.assertEqual(entity.id, self.user.pk)
        self.assertEqual(entity.username, "countuser")
        self.assertEqual(entity.email, "countuser@example.com")
        self.assertTrue(entity.is_active)
