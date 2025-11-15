"""
Tests for auth serializers
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import serializers
from rest_framework.test import APITestCase

from app.auth.serializers import (
    CredentialsSerializerMixin,
    EmailVerificationSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RefreshSerializer,
    UserSerializer,
    UserSignupSerializer,
    UserUpdateSerializer,
)
from app.utils.encryption import encrypt_api_key, is_encrypted

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class UserSignupSerializerTests(APITestCase):
    """Tests for UserSignupSerializer"""

    def test_create_user_success(self):
        """Test successful user creation"""
        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()

        self.assertEqual(user.username, "newuser")
        self.assertEqual(user.email, "newuser@example.com")
        self.assertFalse(user.is_active)  # Should be inactive until email verification
        self.assertEqual(len(mail.outbox), 1)

    def test_create_user_duplicate_email(self):
        """Test user creation with duplicate email"""
        User.objects.create_user(
            username="existing",
            email="existing@example.com",
            password="pass123",
        )

        data = {
            "username": "newuser",
            "email": "existing@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_validate_email_case_insensitive(self):
        """Test email validation is case insensitive"""
        User.objects.create_user(
            username="existing",
            email="Existing@Example.com",
            password="pass123",
        )

        data = {
            "username": "newuser",
            "email": "existing@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    @patch("app.auth.serializers.send_email_verification")
    def test_create_user_email_send_failure(self, mock_send_email):
        """Test user creation when email sending fails"""
        mock_send_email.side_effect = Exception("Email service unavailable")

        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertTrue(serializer.is_valid())

        with self.assertRaises(serializers.ValidationError):
            serializer.save()

        # User should be deleted if email sending fails
        self.assertFalse(User.objects.filter(username="newuser").exists())

    @patch("app.auth.serializers.User.objects.create_user")
    def test_create_user_database_error(self, mock_create_user):
        """Test user creation when database error occurs"""
        mock_create_user.side_effect = Exception("Database error")

        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertTrue(serializer.is_valid())

        with self.assertRaises(Exception):
            serializer.save()


class LoginSerializerTests(APITestCase):
    """Tests for LoginSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_login_success(self):
        """Test successful login"""
        data = {"username": "testuser", "password": "testpass123"}
        serializer = LoginSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data["user"], self.user)

    def test_login_invalid_username(self):
        """Test login with invalid username"""
        data = {"username": "wronguser", "password": "testpass123"}
        serializer = LoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_login_invalid_password(self):
        """Test login with invalid password"""
        data = {"username": "testuser", "password": "wrongpass"}
        serializer = LoginSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_login_missing_credentials(self):
        """Test login with missing credentials"""
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


class UserUpdateSerializerTests(APITestCase):
    """Tests for UserUpdateSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_update_with_plain_api_key(self):
        """Test updating with plain text API key"""
        plain_key = "sk-test123"
        serializer = UserUpdateSerializer(
            self.user, data={"encrypted_openai_api_key": plain_key}
        )
        self.assertTrue(serializer.is_valid())
        serializer.save()

        self.user.refresh_from_db()
        self.assertTrue(is_encrypted(self.user.encrypted_openai_api_key))

    def test_update_with_encrypted_api_key(self):
        """Test updating with already encrypted API key"""
        encrypted_key = encrypt_api_key("sk-test123")
        serializer = UserUpdateSerializer(
            self.user, data={"encrypted_openai_api_key": encrypted_key}
        )
        self.assertTrue(serializer.is_valid())
        serializer.save()

        self.user.refresh_from_db()
        self.assertEqual(self.user.encrypted_openai_api_key, encrypted_key)

    def test_update_with_null(self):
        """Test updating with null API key"""
        self.user.encrypted_openai_api_key = encrypt_api_key("sk-test123")
        self.user.save()

        serializer = UserUpdateSerializer(
            self.user, data={"encrypted_openai_api_key": None}
        )
        self.assertTrue(serializer.is_valid())
        serializer.save()

        self.user.refresh_from_db()
        self.assertIsNone(self.user.encrypted_openai_api_key)


class RefreshSerializerTests(APITestCase):
    """Tests for RefreshSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_validate_refresh_token_valid(self):
        """Test validation with valid refresh token"""
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(self.user)
        serializer = RefreshSerializer(data={"refresh": str(refresh)})
        self.assertTrue(serializer.is_valid())

    def test_validate_refresh_token_invalid(self):
        """Test validation with invalid refresh token"""
        serializer = RefreshSerializer(data={"refresh": "invalid-token"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("refresh", serializer.errors)

    def test_validate_refresh_token_empty(self):
        """Test validation with empty refresh token"""
        serializer = RefreshSerializer(data={"refresh": ""})
        self.assertFalse(serializer.is_valid())
        self.assertIn("refresh", serializer.errors)


class EmailVerificationSerializerTests(APITestCase):
    """Tests for EmailVerificationSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            is_active=False,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)

    def test_verify_email_success(self):
        """Test successful email verification"""
        data = {"uid": self.uid, "token": self.token}
        serializer = EmailVerificationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()

        self.assertTrue(user.is_active)
        self.assertEqual(user, self.user)

    def test_verify_email_invalid_uid(self):
        """Test email verification with invalid uid"""
        data = {"uid": "invalid", "token": self.token}
        serializer = EmailVerificationSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_verify_email_invalid_token(self):
        """Test email verification with invalid token"""
        data = {"uid": self.uid, "token": "invalid-token"}
        serializer = EmailVerificationSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_verify_email_already_active(self):
        """Test email verification for already active user"""
        self.user.is_active = True
        self.user.save()

        data = {"uid": self.uid, "token": self.token}
        serializer = EmailVerificationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = serializer.save()

        self.assertTrue(user.is_active)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordResetRequestSerializerTests(APITestCase):
    """Tests for PasswordResetRequestSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            is_active=True,
        )

    def test_request_reset_success(self):
        """Test successful password reset request"""
        data = {"email": self.user.email}
        serializer = PasswordResetRequestSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        result = serializer.save()

        self.assertEqual(result, self.user)
        self.assertEqual(len(mail.outbox), 1)

    def test_request_reset_nonexistent_email(self):
        """Test password reset request with nonexistent email"""
        data = {"email": "nonexistent@example.com"}
        serializer = PasswordResetRequestSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        result = serializer.save()

        self.assertIsNone(result)
        self.assertEqual(len(mail.outbox), 0)


class PasswordResetConfirmSerializerTests(APITestCase):
    """Tests for PasswordResetConfirmSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="oldpass123",
            is_active=True,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)

    def test_confirm_reset_success(self):
        """Test successful password reset confirmation"""
        data = {
            "uid": self.uid,
            "token": self.token,
            "new_password": "NewSecurePass123",
        }
        serializer = PasswordResetConfirmSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        serializer.save()

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecurePass123"))

    def test_confirm_reset_invalid_uid(self):
        """Test password reset confirmation with invalid uid"""
        data = {
            "uid": "invalid",
            "token": self.token,
            "new_password": "NewSecurePass123",
        }
        serializer = PasswordResetConfirmSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_confirm_reset_invalid_token(self):
        """Test password reset confirmation with invalid token"""
        data = {
            "uid": self.uid,
            "token": "invalid-token",
            "new_password": "NewSecurePass123",
        }
        serializer = PasswordResetConfirmSerializer(data=data)
        self.assertFalse(serializer.is_valid())
        self.assertIn("non_field_errors", serializer.errors)

    def test_confirm_reset_weak_password(self):
        """Test password reset confirmation with weak password"""
        data = {
            "uid": self.uid,
            "token": self.token,
            "new_password": "123",  # Too short
        }
        serializer = PasswordResetConfirmSerializer(data=data)
        self.assertFalse(serializer.is_valid())


class CredentialsSerializerMixinTests(APITestCase):
    """Tests for CredentialsSerializerMixin"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_validate_credentials_success(self):
        """Test validate_credentials with valid credentials"""
        mixin = CredentialsSerializerMixin()
        user = mixin.validate_credentials("testuser", "testpass123")

        self.assertEqual(user, self.user)

    def test_validate_credentials_invalid_username(self):
        """Test validate_credentials with invalid username"""
        mixin = CredentialsSerializerMixin()

        with self.assertRaises(serializers.ValidationError):
            mixin.validate_credentials("wronguser", "testpass123")

    def test_validate_credentials_invalid_password(self):
        """Test validate_credentials with invalid password"""
        mixin = CredentialsSerializerMixin()

        with self.assertRaises(serializers.ValidationError):
            mixin.validate_credentials("testuser", "wrongpass")

    def test_validate_credentials_missing_username(self):
        """Test validate_credentials with missing username"""
        mixin = CredentialsSerializerMixin()

        with self.assertRaises(serializers.ValidationError):
            mixin.validate_credentials("", "testpass123")

    def test_validate_credentials_missing_password(self):
        """Test validate_credentials with missing password"""
        mixin = CredentialsSerializerMixin()

        with self.assertRaises(serializers.ValidationError):
            mixin.validate_credentials("testuser", "")

