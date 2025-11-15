"""
Tests for common permissions module
"""
import secrets

from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework.request import Request
from rest_framework.test import APITestCase, APIRequestFactory

from app.common.permissions import (
    IsAuthenticatedOrSharedAccess,
    ShareTokenAuthentication,
)
from app.models import VideoGroup

User = get_user_model()


class ShareTokenAuthenticationTests(APITestCase):
    """Tests for ShareTokenAuthentication"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        # Generate share_token for testing
        share_token = secrets.token_urlsafe(32)
        self.group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test", share_token=share_token
        )
        self.auth = ShareTokenAuthentication()
        self.factory = APIRequestFactory()

    def test_authenticate_with_valid_token(self):
        """Test authentication with valid share token"""
        request = self.factory.get("/", {"share_token": self.group.share_token})
        drf_request = Request(request)

        result = self.auth.authenticate(drf_request)

        self.assertIsNotNone(result)
        user, auth_data = result
        self.assertIsNone(user)
        self.assertEqual(auth_data["share_token"], self.group.share_token)
        self.assertEqual(auth_data["group"], self.group)

    def test_authenticate_with_invalid_token(self):
        """Test authentication with invalid share token"""
        request = self.factory.get("/", {"share_token": "invalid-token"})
        drf_request = Request(request)

        result = self.auth.authenticate(drf_request)

        self.assertIsNone(result)

    def test_authenticate_without_token(self):
        """Test authentication without share token"""
        request = self.factory.get("/")
        drf_request = Request(request)

        result = self.auth.authenticate(drf_request)

        self.assertIsNone(result)


class IsAuthenticatedOrSharedAccessTests(APITestCase):
    """Tests for IsAuthenticatedOrSharedAccess permission"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.permission = IsAuthenticatedOrSharedAccess()
        self.factory = RequestFactory()

    def test_has_permission_with_authenticated_user(self):
        """Test permission with authenticated user"""
        request = self.factory.get("/")
        request.user = self.user

        result = self.permission.has_permission(request, None)

        self.assertTrue(result)

    def test_has_permission_with_share_token(self):
        """Test permission with share token"""
        group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        request = self.factory.get("/")
        request.user = None
        request.auth = {"share_token": group.share_token, "group": group}

        result = self.permission.has_permission(request, None)

        self.assertTrue(result)

    def test_has_permission_without_auth(self):
        """Test permission without authentication"""
        request = self.factory.get("/")
        request.user = None
        request.auth = None

        result = self.permission.has_permission(request, None)

        self.assertFalse(result)

    def test_has_permission_with_invalid_auth(self):
        """Test permission with invalid auth data"""
        request = self.factory.get("/")
        request.user = None
        request.auth = {"invalid": "data"}

        result = self.permission.has_permission(request, None)

        self.assertFalse(result)

