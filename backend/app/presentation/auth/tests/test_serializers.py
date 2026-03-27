"""
Tests for auth serializers
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from app.domain.user.entities import UserEntity
from app.presentation.auth.serializers import (EmailVerificationSerializer,
                                               LoginSerializer,
                                               PasswordResetRequestSerializer,
                                               UserSerializer,
                                               UserSignupSerializer)

User = get_user_model()


class UserSignupSerializerTests(APITestCase):
    """Tests for UserSignupSerializer — field validation only.
    Business logic (user creation, email sending) is tested via view tests.
    """

    def test_valid_data_passes(self):
        """Test that valid signup data passes validation"""
        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_weak_password_rejected(self):
        """Test that a weak password fails validation"""
        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("password", serializer.errors)

    def test_missing_required_fields(self):
        """Test that missing required fields fail validation"""
        serializer = UserSignupSerializer(data={"username": "newuser"})
        self.assertFalse(serializer.is_valid())


class LoginSerializerTests(APITestCase):
    """Tests for LoginSerializer field-level validation only."""

    def test_login_payload_shape_valid(self):
        """Test valid login payload passes serializer validation."""
        data = {"username": "testuser", "password": "testpass123"}
        serializer = LoginSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_login_missing_credentials(self):
        """Test login with missing credentials fails."""
        data = {"username": "testuser"}
        serializer = LoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())


class UserSerializerTests(APITestCase):
    """Tests for UserSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_serialize_user(self):
        """Test serializing user"""
        serializer = UserSerializer(self.user)
        self.assertEqual(serializer.data["username"], "testuser")
        self.assertEqual(serializer.data["email"], "test@example.com")
        self.assertIn("id", serializer.data)

    def test_serialize_user_entity_uses_video_count_field(self):
        """UserEntity should serialize explicit video_count without ORM relation access."""
        entity = UserEntity(
            id=1,
            username="entityuser",
            email="entity@example.com",
            is_active=True,
            video_count=7,
        )
        serializer = UserSerializer(entity)
        self.assertEqual(serializer.data["video_count"], 7)


class EmailVerificationSerializerTests(APITestCase):
    """Tests for EmailVerificationSerializer — field presence validation only.
    Token validity is verified by the use case (VerifyEmailUseCase).
    """

    def test_valid_data_passes(self):
        """Test that valid uid and token pass serializer validation"""
        data = {"uid": "some-uid", "token": "some-token"}
        serializer = EmailVerificationSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_missing_uid(self):
        """Test that missing uid fails validation"""
        serializer = EmailVerificationSerializer(data={"token": "some-token"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("uid", serializer.errors)

    def test_missing_token(self):
        """Test that missing token fails validation"""
        serializer = EmailVerificationSerializer(data={"uid": "some-uid"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("token", serializer.errors)


class PasswordResetRequestSerializerTests(APITestCase):
    """Tests for PasswordResetRequestSerializer — field validation only.
    Business logic (email sending, user lookup) is tested via view tests.
    """

    def test_valid_email_passes(self):
        """Test that a valid email passes serializer validation"""
        serializer = PasswordResetRequestSerializer(data={"email": "user@example.com"})
        self.assertTrue(serializer.is_valid())

    def test_invalid_email_rejected(self):
        """Test that an invalid email format is rejected"""
        serializer = PasswordResetRequestSerializer(data={"email": "not-an-email"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_missing_email_rejected(self):
        """Test that missing email is rejected"""
        serializer = PasswordResetRequestSerializer(data={})
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)
