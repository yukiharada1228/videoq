"""
Tests for auth serializers
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APITestCase

from app.presentation.auth.serializers import (EmailVerificationSerializer,
                                               LoginSerializer,
                                               PasswordResetConfirmSerializer,
                                               PasswordResetRequestSerializer,
                                               RefreshSerializer,
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


class RefreshSerializerTests(APITestCase):
    """Tests for RefreshSerializer field-level validation only."""

    def test_refresh_token_string_is_accepted(self):
        """Test that any non-empty token string passes serializer validation."""
        serializer = RefreshSerializer(data={"refresh": "any-token-string"})
        self.assertTrue(serializer.is_valid())

    def test_validate_refresh_token_empty(self):
        """Test validation with empty refresh token"""
        serializer = RefreshSerializer(data={"refresh": ""})
        self.assertFalse(serializer.is_valid())
        self.assertIn("refresh", serializer.errors)


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


class PasswordResetConfirmSerializerTests(APITestCase):
    """Tests for PasswordResetConfirmSerializer — field validation only.
    Token validity is verified by the use case (ConfirmPasswordResetUseCase).
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="oldpass123",
            is_active=True,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)

    def test_valid_data_passes(self):
        """Test that valid uid, token and strong password pass validation"""
        data = {
            "uid": self.uid,
            "token": self.token,
            "new_password": "NewSecurePass123",
        }
        serializer = PasswordResetConfirmSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_confirm_reset_weak_password(self):
        """Test password reset confirmation with weak password"""
        data = {
            "uid": self.uid,
            "token": self.token,
            "new_password": "123",  # Too short
        }
        serializer = PasswordResetConfirmSerializer(data=data)
        self.assertFalse(serializer.is_valid())

    def test_missing_required_fields(self):
        """Test that missing fields fail validation"""
        serializer = PasswordResetConfirmSerializer(data={"uid": self.uid})
        self.assertFalse(serializer.is_valid())
