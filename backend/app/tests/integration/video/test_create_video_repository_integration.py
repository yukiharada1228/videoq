"""Integration tests for CreateVideoUseCase with Django ORM repository."""

from io import BytesIO
from unittest.mock import MagicMock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from app.infrastructure.repositories.django_video_repository import DjangoVideoRepository
from app.models import Video
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.dto import CreateVideoInput
from app.use_cases.video.exceptions import VideoLimitExceeded

User = get_user_model()


def _make_video_file(name: str = "test.mp4"):
    return SimpleUploadedFile(
        name, BytesIO(b"fake video content").read(), content_type="video/mp4"
    )


class CreateVideoUseCaseIntegrationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="integration_user",
            email="integration@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.repo = DjangoVideoRepository()
        self.mock_task_queue = MagicMock()
        self.use_case = CreateVideoUseCase(self.repo, self.mock_task_queue)

    def _input(self):
        file = _make_video_file()
        return CreateVideoInput(
            file=file,
            title="Test Video",
            description="",
        )

    def test_persists_video_and_enqueues_task(self):
        video = self.use_case.execute(self.user.id, self.user.video_limit, self._input())

        self.assertTrue(Video.objects.filter(pk=video.id).exists())
        self.mock_task_queue.enqueue_transcription.assert_called_once_with(video.id)

    def test_enforces_limit_against_persisted_rows(self):
        self.user.video_limit = 1
        self.user.save(update_fields=["video_limit"])
        Video.objects.create(user=self.user, title="Existing")

        with self.assertRaises(VideoLimitExceeded):
            self.use_case.execute(self.user.id, self.user.video_limit, self._input())
