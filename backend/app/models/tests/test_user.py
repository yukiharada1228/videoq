"""
Tests for User model
"""

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

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
