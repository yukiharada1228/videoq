"""
Tests for CreateVideoUseCase — quota enforcement and task dispatch.
"""

from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from app.infrastructure.repositories.django_video_repository import DjangoVideoRepository
from app.models import Video
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.exceptions import VideoLimitExceeded

User = get_user_model()


def _make_video_file():
    return SimpleUploadedFile(
        "test.mp4", BytesIO(b"fake video content").read(), content_type="video/mp4"
    )


class CreateVideoUseCaseTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.repo = DjangoVideoRepository()
        self.use_case = CreateVideoUseCase(self.repo)

    def _validated_data(self):
        return {"file": _make_video_file(), "title": "Test Video", "description": ""}

    @patch("app.use_cases.video.create_video.transaction.on_commit")
    def test_creates_video_successfully(self, mock_on_commit):
        """Use case returns a Video instance on success"""
        video = self.use_case.execute(self.user, self._validated_data())

        self.assertIsNotNone(video.id)
        self.assertEqual(video.title, "Test Video")
        self.assertTrue(Video.objects.filter(pk=video.pk).exists())

    @patch("app.use_cases.video.create_video.transaction.on_commit")
    def test_dispatches_transcription_task_on_commit(self, mock_on_commit):
        """Transcription task is registered with on_commit after creation"""
        self.use_case.execute(self.user, self._validated_data())

        mock_on_commit.assert_called_once()

    @patch("app.tasks.transcribe_video.delay")
    def test_transcription_task_called_with_video_id(self, mock_delay):
        """transcribe_video.delay is called with the new video's ID"""
        with self.captureOnCommitCallbacks(execute=True):
            video = self.use_case.execute(self.user, self._validated_data())

        mock_delay.assert_called_once_with(video.id)

    def test_raises_video_limit_exceeded_when_limit_zero(self):
        """VideoLimitExceeded raised when video_limit is 0"""
        self.user.video_limit = 0
        self.user.save()

        with self.assertRaises(VideoLimitExceeded):
            self.use_case.execute(self.user, self._validated_data())

    @patch("app.use_cases.video.create_video.transaction.on_commit")
    def test_raises_video_limit_exceeded_when_limit_reached(self, mock_on_commit):
        """VideoLimitExceeded raised when the user has hit their limit"""
        self.user.video_limit = 2
        self.user.save()

        Video.objects.create(user=self.user, title="Video 1")
        Video.objects.create(user=self.user, title="Video 2")

        with self.assertRaises(VideoLimitExceeded):
            self.use_case.execute(self.user, self._validated_data())

    @patch("app.use_cases.video.create_video.transaction.on_commit")
    def test_allows_upload_when_within_limit(self, mock_on_commit):
        """Upload succeeds when user is under their limit"""
        self.user.video_limit = 3
        self.user.save()

        Video.objects.create(user=self.user, title="Video 1")

        video = self.use_case.execute(self.user, self._validated_data())

        self.assertIsNotNone(video.id)

    @patch("app.use_cases.video.create_video.transaction.on_commit")
    def test_allows_unlimited_uploads(self, mock_on_commit):
        """No limit enforced when video_limit is None"""
        self.user.video_limit = None
        self.user.save()

        for i in range(10):
            Video.objects.create(user=self.user, title=f"Video {i}")

        video = self.use_case.execute(self.user, self._validated_data())

        self.assertIsNotNone(video.id)
