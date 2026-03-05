"""
Tests for common authentication module
"""

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.models import UserApiKey

User = get_user_model()


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
        user, key_record = result
        self.assertEqual(user, self.user)
        self.assertEqual(key_record.pk, self.api_key.pk)

    def test_authenticate_with_authorization_header(self):
        """Test authentication using Authorization header."""
        request = self.factory.get(
            "/",
            HTTP_AUTHORIZATION=f"ApiKey {self.raw_key}",
        )

        result = self.auth.authenticate(request)

        self.assertIsNotNone(result)
        user, key_record = result
        self.assertEqual(user, self.user)
        self.assertEqual(key_record.pk, self.api_key.pk)

    def test_authenticate_with_invalid_api_key(self):
        """Test authentication failure with invalid API key."""
        request = self.factory.get("/", HTTP_X_API_KEY="vq_invalid")

        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(request)

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
        user, key_record = result
        self.assertEqual(user, self.user)
        self.assertEqual(key_record.pk, read_only_key.pk)
