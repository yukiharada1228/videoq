"""Unit tests for user domain entities."""

from unittest import TestCase

from app.domain.user.entities import UserEntity
from app.domain.video.exceptions import VideoLimitExceeded


class UserEntityUploadLimitTests(TestCase):
    """Tests for UserEntity upload limit enforcement."""

    def _user(self, video_limit=None, video_count=0):
        return UserEntity(
            id=1,
            username="test",
            email="test@example.com",
            is_active=True,
            video_limit=video_limit,
            video_count=video_count,
        )

    def test_can_upload_when_unlimited(self):
        user = self._user(video_limit=None, video_count=100)
        self.assertTrue(user.can_upload_video())

    def test_can_upload_when_within_limit(self):
        user = self._user(video_limit=5, video_count=3)
        self.assertTrue(user.can_upload_video())

    def test_cannot_upload_when_at_limit(self):
        user = self._user(video_limit=3, video_count=3)
        self.assertFalse(user.can_upload_video())

    def test_cannot_upload_when_over_limit(self):
        user = self._user(video_limit=2, video_count=5)
        self.assertFalse(user.can_upload_video())

    def test_ensure_can_upload_raises_when_at_limit(self):
        user = self._user(video_limit=3, video_count=3)
        with self.assertRaises(VideoLimitExceeded):
            user.ensure_can_upload()

    def test_ensure_can_upload_passes_when_unlimited(self):
        user = self._user(video_limit=None, video_count=100)
        user.ensure_can_upload()  # should not raise

    def test_ensure_can_upload_passes_when_within_limit(self):
        user = self._user(video_limit=5, video_count=2)
        user.ensure_can_upload()  # should not raise
