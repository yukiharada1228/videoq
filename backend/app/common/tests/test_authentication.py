"""
Tests for common authentication module
"""

from app.common.authentication import CookieJWTAuthentication
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

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

        # Create another user for cookie
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

        # Should use header (first user)
        self.assertIsNotNone(result)
        user, token = result
        self.assertEqual(user, self.user)
