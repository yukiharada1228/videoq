"""
Tests for User model
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase, override_settings

User = get_user_model()


class UserModelTests(TestCase):
    """Tests for User model"""

    def test_create_user_with_required_fields(self):
        """Test creating a user with required fields"""
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password("testpass123"))

    def test_email_is_unique(self):
        """Test that email must be unique"""
        User.objects.create_user(
            username="user1",
            email="test@example.com",
            password="testpass123",
        )

        with self.assertRaises(IntegrityError):
            User.objects.create_user(
                username="user2",
                email="test@example.com",
                password="testpass123",
            )

    def test_default_video_limit_from_settings(self):
        """Test that default video_limit comes from settings.DEFAULT_VIDEO_LIMIT"""
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.assertEqual(user.video_limit, settings.DEFAULT_VIDEO_LIMIT)

    @override_settings(DEFAULT_VIDEO_LIMIT=42)
    def test_default_video_limit_respects_override(self):
        """Test that video_limit default reflects settings override at field level"""
        # Note: Django model field default is evaluated at class definition time,
        # so we use a callable default to pick up settings dynamically.
        user = User.objects.create_user(
            username="testuser2",
            email="test2@example.com",
            password="testpass123",
        )
        self.assertEqual(user.video_limit, 42)

    def test_video_limit_can_be_none(self):
        """Test that video_limit can be None (unlimited)"""
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )

        self.assertIsNone(user.video_limit)

    def test_video_limit_can_be_positive(self):
        """Test that video_limit can be a positive integer"""
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=10,
        )

        self.assertEqual(user.video_limit, 10)

    def test_default_max_video_upload_size_mb_from_settings(self):
        """Test that default max_video_upload_size_mb comes from settings"""
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.assertEqual(user.max_video_upload_size_mb, settings.MAX_VIDEO_UPLOAD_SIZE_MB)

    @override_settings(MAX_VIDEO_UPLOAD_SIZE_MB=1024)
    def test_default_max_video_upload_size_mb_respects_override(self):
        """Test that max_video_upload_size_mb default reflects settings override"""
        user = User.objects.create_user(
            username="testuser3",
            email="test3@example.com",
            password="testpass123",
        )
        self.assertEqual(user.max_video_upload_size_mb, 1024)

    def test_user_inherits_from_abstract_user(self):
        """Test that User inherits all AbstractUser functionality"""
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

        # Test AbstractUser fields
        self.assertTrue(hasattr(user, "first_name"))
        self.assertTrue(hasattr(user, "last_name"))
        self.assertTrue(hasattr(user, "is_staff"))
        self.assertTrue(hasattr(user, "is_active"))
        self.assertTrue(hasattr(user, "date_joined"))
