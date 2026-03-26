"""
Tests for common authentication module
"""

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from app.presentation.common.authentication import APIKeyAuthentication, CookieJWTAuthentication

User = get_user_model()
UserApiKey = apps.get_model("app", "UserApiKey")


class CookieJWTAuthenticationTests(APITestCase):
    """Tests for CookieJWTAuthentication"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.auth = CookieJWTAuthentication()
        self.factory = RequestFactory()

    def test_authenticate_with_cookie(self):
        """Test authentication using cookie"""
        refresh = RefreshToken.for_user(self.user)
        access_token = str(refresh.access_token)

        request = self.factory.get("/")
        request.COOKIES = {"access_token": access_token}

        result = self.auth.authenticate(request)

        self.assertIsNotNone(result)
        user, token = result
        self.assertEqual(user, self.user)

    def test_authenticate_with_header(self):
        """Test authentication using Authorization header"""
        refresh = RefreshToken.for_user(self.user)
        access_token = str(refresh.access_token)

        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {access_token}")

        result = self.auth.authenticate(request)

        self.assertIsNotNone(result)
        user, token = result
        self.assertEqual(user, self.user)

    def test_authenticate_with_invalid_cookie(self):
        """Test authentication with invalid token in cookie"""
        request = self.factory.get("/")
        request.COOKIES = {"access_token": "invalid-token"}

        result = self.auth.authenticate(request)

        self.assertIsNone(result)

    def test_authenticate_without_token(self):
        """Test authentication without token"""
        request = self.factory.get("/")

        result = self.auth.authenticate(request)

        self.assertIsNone(result)

    def test_authenticate_header_priority(self):
        """Test that header authentication takes priority over cookie"""
        refresh = RefreshToken.for_user(self.user)
        access_token = str(refresh.access_token)

        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )
        other_refresh = RefreshToken.for_user(other_user)
        other_access_token = str(other_refresh.access_token)

        request = self.factory.get("/", HTTP_AUTHORIZATION=f"Bearer {access_token}")
        request.COOKIES = {"access_token": other_access_token}

        result = self.auth.authenticate(request)

        self.assertIsNotNone(result)
        user, token = result
        self.assertEqual(user, self.user)

    def test_cookie_authentication_rejects_unsafe_request_without_csrf(self):
        """Unsafe requests using cookie auth must pass Django's CSRF check."""
        refresh = RefreshToken.for_user(self.user)
        access_token = str(refresh.access_token)

        request = self.factory.post("/")
        request.COOKIES = {"access_token": access_token}

        with self.assertRaises(PermissionDenied):
            self.auth.authenticate(request)

    def test_header_authentication_allows_unsafe_request_without_csrf(self):
        """Bearer-header auth should not require CSRF because it is not cookie-based."""
        refresh = RefreshToken.for_user(self.user)
        access_token = str(refresh.access_token)

        request = self.factory.post("/", HTTP_AUTHORIZATION=f"Bearer {access_token}")

        result = self.auth.authenticate(request)

        self.assertIsNotNone(result)
        user, token = result
        self.assertEqual(user, self.user)


class APIKeyAuthenticationTests(APITestCase):
    """Tests for APIKeyAuthentication"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="apikeyuser",
            email="apikey@example.com",
            password="testpass123",
        )
        self.auth = APIKeyAuthentication()
        self.factory = RequestFactory()
        self.api_key, self.raw_key = UserApiKey.create_for_user(
            user=self.user,
            name="integration",
        )

    def test_authenticate_with_x_api_key_header(self):
        """Test authentication using X-API-Key header."""
        request = self.factory.get("/", HTTP_X_API_KEY=self.raw_key)

        result = self.auth.authenticate(request)

        self.assertIsNotNone(result)
        user, auth_data = result
        self.assertEqual(user.id, self.user.id)
        self.assertEqual(auth_data["api_key_id"], self.api_key.pk)
        self.assertEqual(auth_data["user_id"], self.user.id)
        self.assertEqual(auth_data["access_level"], self.api_key.access_level)

    def test_authenticate_with_authorization_header(self):
        """Test authentication using Authorization header."""
        request = self.factory.get(
            "/",
            HTTP_AUTHORIZATION=f"ApiKey {self.raw_key}",
        )

        result = self.auth.authenticate(request)

        self.assertIsNotNone(result)
        user, auth_data = result
        self.assertEqual(user.id, self.user.id)
        self.assertEqual(auth_data["api_key_id"], self.api_key.pk)

    def test_authenticate_with_invalid_api_key(self):
        """Test authentication failure with valid-format key that does not exist in DB."""
        request = self.factory.get("/", HTTP_X_API_KEY="vq_" + "x" * 32)

        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(request)

    def test_authenticate_returns_none_for_key_without_vq_prefix(self):
        """Keys without vq_ prefix should return None without hitting the DB."""
        request = self.factory.get("/", HTTP_X_API_KEY="sk_invalidkeyformat1234")

        result = self.auth.authenticate(request)

        self.assertIsNone(result)

    def test_authenticate_returns_none_for_key_shorter_than_minimum(self):
        """Keys shorter than 12 characters should return None without hitting the DB."""
        request = self.factory.get("/", HTTP_X_API_KEY="vq_short")

        result = self.auth.authenticate(request)

        self.assertIsNone(result)

    def test_read_only_api_key_authenticates_without_scope_check(self):
        """Authentication layer should not apply read-only authorization rules."""
        read_only_key, raw_key = UserApiKey.create_for_user(
            user=self.user,
            name="read-only-chat",
            access_level=UserApiKey.AccessLevel.READ_ONLY,
        )
        request = self.factory.post("/api/videos/groups/", HTTP_X_API_KEY=raw_key)

        result = self.auth.authenticate(request)

        self.assertIsNotNone(result)
        user, auth_data = result
        self.assertEqual(user.id, self.user.id)
        self.assertEqual(auth_data["api_key_id"], read_only_key.pk)
        self.assertEqual(auth_data["user_id"], self.user.id)
        self.assertEqual(auth_data["access_level"], read_only_key.access_level)
