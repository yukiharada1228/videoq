"""
Tests for auth views
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from app.models import UserApiKey

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    ENABLE_SIGNUP=True,
)
class UserSignupViewTests(APITestCase):
    """Tests for UserSignupView"""

    def test_signup_success(self):
        """Test successful user signup"""
        url = reverse("signup")
        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("message", response.data)
        self.assertTrue(User.objects.filter(username="newuser").exists())
        self.assertEqual(len(mail.outbox), 1)


class LoginViewTests(APITestCase):
    """Tests for LoginView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.url = reverse("auth-login")

    def test_login_success(self):
        """Test successful login"""
        data = {"username": "testuser", "password": "testpass123"}
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        # Check cookies are set
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        data = {"username": "testuser", "password": "wrongpass"}
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LogoutViewTests(APITestCase):
    """Tests for LogoutView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("auth-logout")

    def test_logout_success(self):
        """Test successful logout"""
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check cookies are deleted
        self.assertEqual(response.cookies.get("access_token").value, "")
        self.assertEqual(response.cookies.get("refresh_token").value, "")


class RefreshViewTests(APITestCase):
    """Tests for RefreshView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.url = reverse("auth-refresh")

    def test_refresh_with_cookie(self):
        """Test token refresh using cookie"""
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(self.user)
        self.client.cookies["refresh_token"] = str(refresh)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("access_token", response.cookies)

    def test_refresh_with_body(self):
        """Test token refresh using request body"""
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(self.user)
        data = {"refresh": str(refresh)}

        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_refresh_invalid_token(self):
        """Test token refresh with invalid token"""
        self.client.cookies["refresh_token"] = "invalid-token"

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_with_empty_cookie(self):
        """Test token refresh with empty cookie"""
        self.client.cookies["refresh_token"] = ""

        response = self.client.post(self.url, {"refresh": ""}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class EmailVerificationViewTests(APITestCase):
    """Tests for EmailVerificationView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            is_active=False,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)
        self.url = reverse("auth-verify-email")

    def test_verify_email_success(self):
        """Test successful email verification"""
        data = {"uid": self.uid, "token": self.token}
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)


class PasswordResetRequestViewTests(APITestCase):
    """Tests for PasswordResetRequestView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            is_active=True,
        )
        self.url = reverse("auth-password-reset")

    def test_request_reset_success(self):
        """Test successful password reset request"""
        data = {"email": self.user.email}
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)


class PasswordResetConfirmViewTests(APITestCase):
    """Tests for PasswordResetConfirmView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="oldpass123",
            is_active=True,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)
        self.url = reverse("auth-password-reset-confirm")

    def test_confirm_reset_success(self):
        """Test successful password reset confirmation"""
        data = {
            "uid": self.uid,
            "token": self.token,
            "new_password": "NewSecurePass123",
        }
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecurePass123"))


class MeViewTests(APITestCase):
    """Tests for MeView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("auth-me")

    def test_get_current_user(self):
        """Test getting current user information"""
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "testuser")
        self.assertEqual(response.data["email"], "test@example.com")

    def test_get_current_user_unauthenticated(self):
        """Test getting current user without authentication"""
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_current_user_with_api_key(self):
        """Test getting current user information using API key auth."""
        _, raw_key = UserApiKey.create_for_user(user=self.user, name="integration")
        self.client.force_authenticate(user=None)

        response = self.client.get(self.url, HTTP_X_API_KEY=raw_key)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "testuser")


class ApiKeyViewTests(APITestCase):
    """Tests for API key management views."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="apikeyuser",
            email="apikey@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("auth-api-keys")

    def test_create_api_key(self):
        """Test creating an API key."""
        response = self.client.post(self.url, {"name": "integration"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("api_key", response.data)
        self.assertEqual(response.data["name"], "integration")

        api_key = UserApiKey.objects.get(user=self.user, name="integration")
        self.assertNotEqual(api_key.hashed_key, response.data["api_key"])
        self.assertEqual(api_key.prefix, response.data["api_key"][:12])

    def test_list_api_keys(self):
        """Test listing active API keys."""
        UserApiKey.create_for_user(user=self.user, name="integration")

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertNotIn("api_key", response.data[0])
        self.assertEqual(response.data[0]["name"], "integration")

    def test_revoke_api_key(self):
        """Test revoking an API key."""
        api_key, _ = UserApiKey.create_for_user(user=self.user, name="integration")

        response = self.client.delete(reverse("auth-api-key-detail", args=[api_key.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        api_key.refresh_from_db()
        self.assertIsNotNone(api_key.revoked_at)


class AccountDeleteViewTests(APITestCase):
    """Tests for AccountDeleteView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="deleteuser",
            email="delete@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("auth-account-delete")

    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_account_delete_marks_inactive_and_enqueues_task(self, mock_delay):
        """Test account delete marks user inactive and enqueues task"""
        response = self.client.delete(
            self.url, {"reason": "no longer needed"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)
        self.assertIsNotNone(self.user.deactivated_at)
        self.assertNotEqual(self.user.username, "deleteuser")
        self.assertNotEqual(self.user.email, "delete@example.com")
        self.assertTrue(self.user.username.startswith("deleted__"))
        self.assertTrue(self.user.email.startswith("deleted__"))
        mock_delay.assert_called_once_with(
            "app.presentation.tasks.account_deletion.delete_account_data",
            args=[self.user.id],
        )
        # Check cookies are deleted
        self.assertEqual(response.cookies.get("access_token").value, "")
        self.assertEqual(response.cookies.get("refresh_token").value, "")

        from app.models import AccountDeletionRequest

        self.assertTrue(
            AccountDeletionRequest.objects.filter(
                user=self.user, reason="no longer needed"
            ).exists()
        )
