"""
Tests for auth views
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class UserSignupViewTests(APITestCase):
    """Tests for UserSignupView"""

    def test_signup_success(self):
        """Test successful user signup"""
        url = reverse("auth-signup")
        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("detail", response.data)
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
        self.url = reverse("auth-email-verification")

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

    def test_update_current_user_api_key(self):
        """Test updating current user API key"""
        plain_key = "sk-test123"
        data = {"encrypted_openai_api_key": plain_key}
        response = self.client.patch(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.encrypted_openai_api_key)

    def test_update_current_user_put(self):
        """Test updating current user with PUT method"""
        plain_key = "sk-test123"
        data = {"encrypted_openai_api_key": plain_key}
        response = self.client.put(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.encrypted_openai_api_key)

    def test_get_current_user_unauthenticated(self):
        """Test getting current user without authentication"""
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_update_current_user_patch(self):
        """Test updating current user with PATCH method"""
        data = {"encrypted_openai_api_key": "sk-test123"}

        response = self.client.patch(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.encrypted_openai_api_key)

