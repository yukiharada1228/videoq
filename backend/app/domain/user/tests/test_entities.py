"""Unit tests for UserEntity domain entity."""

from unittest import TestCase

from app.domain.user.entities import UserEntity


class UserEntityUploadSizeBytesTests(TestCase):
    """get_max_upload_size_bytes converts MB to bytes correctly."""

    def test_default_500mb_converts_to_bytes(self):
        user = UserEntity(id=1, username="u", email="u@example.com", is_active=True)
        self.assertEqual(user.get_max_upload_size_bytes(), 500 * 1024 * 1024)

    def test_custom_mb_value_converts_to_bytes(self):
        user = UserEntity(
            id=1, username="u", email="u@example.com", is_active=True,
            max_video_upload_size_mb=100,
        )
        self.assertEqual(user.get_max_upload_size_bytes(), 100 * 1024 * 1024)

    def test_zero_mb_returns_zero_bytes(self):
        user = UserEntity(
            id=1, username="u", email="u@example.com", is_active=True,
            max_video_upload_size_mb=0,
        )
        self.assertEqual(user.get_max_upload_size_bytes(), 0)

    def test_video_count_defaults_to_zero(self):
        user = UserEntity(id=1, username="u", email="u@example.com", is_active=True)
        self.assertEqual(user.video_count, 0)
