"""Unit tests for user domain entities."""

from unittest import TestCase

from app.domain.user.entities import UserEntity
from app.domain.user.exceptions import UserVideoLimitExceeded


class UserEntityTests(TestCase):
    def test_assert_can_upload_video_raises_when_limit_reached(self):
        user = UserEntity(
            id=1,
            username="user",
            email="user@example.com",
            is_active=True,
            video_limit=2,
            video_count=2,
        )
        with self.assertRaises(UserVideoLimitExceeded):
            user.assert_can_upload_video()

    def test_assert_can_upload_video_uses_current_count_when_given(self):
        user = UserEntity(
            id=1,
            username="user",
            email="user@example.com",
            is_active=True,
            video_limit=3,
            video_count=0,
        )
        with self.assertRaises(UserVideoLimitExceeded):
            user.assert_can_upload_video(current_count=3)

    def test_assert_can_upload_video_allows_unlimited_users(self):
        user = UserEntity(
            id=1,
            username="user",
            email="user@example.com",
            is_active=True,
            video_limit=None,
            video_count=100,
        )
        user.assert_can_upload_video()
