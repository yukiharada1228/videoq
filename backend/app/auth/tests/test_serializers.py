"""
Tests for auth serializers
"""

from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import serializers
from rest_framework.test import APITestCase

from app.auth.services import (confirm_password_reset, create_access_token,
                               create_signup_user, request_password_reset,
                               resolve_email_verification_user,
                               resolve_password_reset_user)
from app.auth.serializers import (CredentialsSerializerMixin,
                                  EmailVerificationSerializer, LoginSerializer,
                                  PasswordResetConfirmSerializer,
                                  PasswordResetRequestSerializer,
                                  RefreshSerializer, UserSerializer,
                                  UserSignupSerializer)

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class UserSignupSerializerTests(APITestCase):
    """Tests for UserSignupSerializer"""

    def test_create_user_success(self):
        """Test successful signup payload validation and service execution"""
        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = create_signup_user(
            user_model=User,
            validated_data=serializer.validated_data,
            send_verification_email=lambda created_user: mail.outbox.append(created_user),
        )

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

    def test_create_user_email_send_failure(self):
        """Test user creation when email sending fails"""
        mock_send_email = Mock(side_effect=Exception("Email service unavailable"))

        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertTrue(serializer.is_valid())

        with self.assertRaises(ValueError):
            create_signup_user(
                user_model=User,
                validated_data=serializer.validated_data,
                send_verification_email=mock_send_email,
            )

        # User should be deleted if email sending fails
        self.assertFalse(User.objects.filter(username="newuser").exists())

    def test_create_user_database_error(self):
        """Test service raises when database write fails"""

        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        serializer = UserSignupSerializer(data=data)
        self.assertTrue(serializer.is_valid())

        with patch.object(User.objects, "create_user", side_effect=Exception("Database error")):
            with self.assertRaises(Exception):
                create_signup_user(
                    user_model=User,
                    validated_data=serializer.validated_data,
                    send_verification_email=lambda user: None,
                )


class LoginSerializerTests(APITestCase):
    """Tests for LoginSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_login_success(self):
        """Test login payload validation"""
        data = {"username": "testuser", "password": "testpass123"}
        serializer = LoginSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data["username"], "testuser")
        self.assertEqual(serializer.validated_data["password"], "testpass123")

    def test_login_invalid_username(self):
        """Serializer does not verify credentials"""
        data = {"username": "wronguser", "password": "testpass123"}
        serializer = LoginSerializer(data=data)
        self.assertTrue(serializer.is_valid())

    def test_login_invalid_password(self):
        """Serializer only validates shape, not password correctness"""
        data = {"username": "testuser", "password": "wrongpass"}
        serializer = LoginSerializer(data=data)
        self.assertTrue(serializer.is_valid())

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


class RefreshSerializerTests(APITestCase):
    """Tests for RefreshSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_validate_refresh_token_valid(self):
        """Serializer accepts a non-empty refresh token string"""
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(self.user)
        serializer = RefreshSerializer(data={"refresh": str(refresh)})
        self.assertTrue(serializer.is_valid())

    def test_validate_refresh_token_invalid(self):
        """Refresh token parsing happens in the service layer"""
        serializer = RefreshSerializer(data={"refresh": "invalid-token"})
        self.assertTrue(serializer.is_valid())

    def test_create_access_token_invalid(self):
        """Service rejects invalid refresh tokens"""
        with self.assertRaises(ValueError):
            create_access_token(refresh_token="invalid-token")

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
        """Test successful email verification resolution"""
        data = {"uid": self.uid, "token": self.token}
        serializer = EmailVerificationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = resolve_email_verification_user(
            user_model=User,
            uid=serializer.validated_data["uid"],
            token=serializer.validated_data["token"],
        )

        self.assertEqual(user, self.user)

    def test_verify_email_invalid_uid(self):
        """Test email verification with invalid uid"""
        data = {"uid": "invalid", "token": self.token}
        serializer = EmailVerificationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        with self.assertRaises(ValueError):
            resolve_email_verification_user(
                user_model=User,
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
            )

    def test_verify_email_invalid_token(self):
        """Test email verification with invalid token"""
        data = {"uid": self.uid, "token": "invalid-token"}
        serializer = EmailVerificationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        with self.assertRaises(ValueError):
            resolve_email_verification_user(
                user_model=User,
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
            )

    def test_verify_email_already_active(self):
        """Test email verification for already active user"""
        self.user.is_active = True
        self.user.save()

        data = {"uid": self.uid, "token": self.token}
        serializer = EmailVerificationSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        user = resolve_email_verification_user(
            user_model=User,
            uid=serializer.validated_data["uid"],
            token=serializer.validated_data["token"],
        )

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
        result = request_password_reset(
            user_model=User,
            email=serializer.validated_data["email"],
            send_reset_email=lambda created_user: mail.outbox.append(created_user),
        )

        self.assertEqual(result, self.user)
        self.assertEqual(len(mail.outbox), 1)

    def test_request_reset_nonexistent_email(self):
        """Test password reset request with nonexistent email"""
        data = {"email": "nonexistent@example.com"}
        serializer = PasswordResetRequestSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        result = request_password_reset(
            user_model=User,
            email=serializer.validated_data["email"],
            send_reset_email=lambda created_user: mail.outbox.append(created_user),
        )

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
        user = resolve_password_reset_user(
            user_model=User,
            uid=serializer.validated_data["uid"],
            token=serializer.validated_data["token"],
            new_password=serializer.validated_data["new_password"],
        )
        confirm_password_reset(
            user=user,
            new_password=serializer.validated_data["new_password"],
        )

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
        self.assertTrue(serializer.is_valid())
        with self.assertRaises(ValueError):
            resolve_password_reset_user(
                user_model=User,
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
                new_password=serializer.validated_data["new_password"],
            )

    def test_confirm_reset_invalid_token(self):
        """Test password reset confirmation with invalid token"""
        data = {
            "uid": self.uid,
            "token": "invalid-token",
            "new_password": "NewSecurePass123",
        }
        serializer = PasswordResetConfirmSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        with self.assertRaises(ValueError):
            resolve_password_reset_user(
                user_model=User,
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
                new_password=serializer.validated_data["new_password"],
            )

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
