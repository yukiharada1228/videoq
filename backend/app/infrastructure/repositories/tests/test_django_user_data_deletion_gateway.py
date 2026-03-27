"""
Tests for DjangoUserDataDeletionGateway — vector deletion error handling.
"""

import logging
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from app.infrastructure.models import Video
from app.infrastructure.repositories.django_user_data_deletion_gateway import (
    DjangoUserDataDeletionGateway,
)

User = get_user_model()

_PATCH_TARGET = "app.infrastructure.repositories.django_user_data_deletion_gateway.delete_video_vectors"


class DeleteAllVideosVectorErrorHandlingTests(TestCase):
    """delete_all_videos_for_user continues and logs when vector deletion fails."""

    def _create_user(self):
        return User.objects.create_user(
            username="vectortestuser",
            email="vectortest@example.com",
            password="testpass123",
        )

    def _create_video(self, user):
        return Video.objects.create(
            user=user,
            file=SimpleUploadedFile("v.mp4", b"fake", content_type="video/mp4"),
            title="Test Video",
            description="",
        )

    @patch(_PATCH_TARGET, side_effect=Exception("PGVector unavailable"))
    def test_video_is_deleted_even_when_vector_deletion_fails(self, _mock):
        user = self._create_user()
        self._create_video(user)

        gateway = DjangoUserDataDeletionGateway()
        gateway.delete_all_videos_for_user(user.id)

        self.assertEqual(Video.objects.filter(user=user).count(), 0)

    @patch(_PATCH_TARGET, side_effect=Exception("PGVector unavailable"))
    def test_warning_is_logged_when_vector_deletion_fails(self, _mock):
        user = self._create_user()
        video = self._create_video(user)

        gateway = DjangoUserDataDeletionGateway()
        with self.assertLogs(
            "app.infrastructure.repositories.django_user_data_deletion_gateway",
            level=logging.WARNING,
        ) as cm:
            gateway.delete_all_videos_for_user(user.id)

        self.assertTrue(
            any(str(video.id) in line for line in cm.output),
            msg=f"Expected video id {video.id} in warning logs: {cm.output}",
        )

    @patch(_PATCH_TARGET, side_effect=Exception("PGVector unavailable"))
    def test_subsequent_videos_are_deleted_after_vector_failure(self, _mock):
        """All videos are deleted even when vector deletion keeps failing."""
        user = self._create_user()
        self._create_video(user)
        self._create_video(user)

        gateway = DjangoUserDataDeletionGateway()
        gateway.delete_all_videos_for_user(user.id)

        self.assertEqual(Video.objects.filter(user=user).count(), 0)

    @patch(_PATCH_TARGET)
    def test_no_warning_logged_when_vector_deletion_succeeds(self, _mock):
        user = self._create_user()
        self._create_video(user)

        gateway = DjangoUserDataDeletionGateway()
        import logging as _logging

        with self.assertNoLogs(
            "app.infrastructure.repositories.django_user_data_deletion_gateway",
            level=_logging.WARNING,
        ):
            gateway.delete_all_videos_for_user(user.id)
