"""
Tests for common permissions module
"""

import secrets

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, APITestCase

from app.presentation.common.permissions import (ApiKeyScopePermission,
                                                 IsAuthenticatedOrSharedAccess,
                                                 ShareTokenAuthentication)

User = get_user_model()
VideoGroup = apps.get_model("app", "VideoGroup")


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
            user=self.user,
            name="Test Group",
            description="Test",
            share_token=share_token,
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
        self.assertEqual(auth_data["group_id"], self.group.id)

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
        request.auth = {"share_token": group.share_token, "group_id": group.id}

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


class ApiKeyScopePermissionTests(APITestCase):
    """Tests for ApiKeyScopePermission"""

    class _DefaultView:
        pass

    class _ChatWriteView:
        required_scope = "chat_write"

    def setUp(self):
        self.user = User.objects.create_user(
            username="apikeyuser",
            email="apikey@example.com",
            password="testpass123",
        )
        self.permission = ApiKeyScopePermission()
        self.factory = RequestFactory()
        self.read_only_auth = {
            "api_key_id": 1,
            "user_id": self.user.id,
            "access_level": "read_only",
        }
        self.full_auth = {
            "api_key_id": 2,
            "user_id": self.user.id,
            "access_level": "all",
        }

    def test_read_only_allows_read_scope_by_default(self):
        request = self.factory.get("/")
        request.auth = self.read_only_auth

        result = self.permission.has_permission(request, self._DefaultView())

        self.assertTrue(result)

    def test_read_only_blocks_write_scope_by_default(self):
        request = self.factory.post("/")
        request.auth = self.read_only_auth

        result = self.permission.has_permission(request, self._DefaultView())

        self.assertFalse(result)

    def test_read_only_allows_chat_write_scope(self):
        request = self.factory.post("/")
        request.auth = self.read_only_auth

        result = self.permission.has_permission(request, self._ChatWriteView())

        self.assertTrue(result)

    def test_full_access_allows_write_scope(self):
        request = self.factory.post("/")
        request.auth = self.full_auth

        result = self.permission.has_permission(request, self._DefaultView())

        self.assertTrue(result)

    def test_non_api_key_auth_bypasses_scope_check(self):
        request = self.factory.post("/")
        request.auth = {"share_token": "x"}

        result = self.permission.has_permission(request, self._DefaultView())

        self.assertTrue(result)
