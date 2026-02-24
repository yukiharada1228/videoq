"""Tests for rate limiting throttle classes."""

import secrets
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.throttling import SimpleRateThrottle

User = get_user_model()

# Use LocMemCache so we don't need a running Redis
_TEST_CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "throttle-tests",
    }
}

# Strict rates for fast test execution
_TEST_THROTTLE_RATES = {
    "chat_share_token_ip": "2/minute",
    "chat_share_token_global": "3/minute",
    "chat_authenticated": "2/minute",
    "login_ip": "2/minute",
    "login_username": "2/minute",
    "signup_ip": "2/minute",
    "password_reset_ip": "2/minute",
    "password_reset_email": "2/minute",
}


@override_settings(CACHES=_TEST_CACHES, ENABLE_SIGNUP=True)
@patch.dict(SimpleRateThrottle.THROTTLE_RATES, _TEST_THROTTLE_RATES)
class ShareTokenIPThrottleTest(APITestCase):
    """Tests for ShareTokenIPThrottle (per-IP limit on share_token chat)."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="pass1234"
        )
        from app.models import VideoGroup

        self.group = VideoGroup.objects.create(
            user=self.user,
            name="test group",
            share_token=secrets.token_urlsafe(32),
        )
        self.url = f"/api/chat/?share_token={self.group.share_token}"
        self.payload = {
            "messages": [{"role": "user", "content": "hi"}],
            "group_id": self.group.id,
        }

    def test_allows_requests_within_limit(self):
        """Requests within the rate limit should succeed (not 429)."""
        for _ in range(2):
            resp = self.client.post(self.url, self.payload, format="json")
            self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_blocks_after_limit(self):
        """Third request from same IP should be throttled."""
        for _ in range(2):
            self.client.post(self.url, self.payload, format="json")
        resp = self.client.post(self.url, self.payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(resp.json()["error"]["code"], "LIMIT_EXCEEDED")


@override_settings(CACHES=_TEST_CACHES, ENABLE_SIGNUP=True)
@patch.dict(SimpleRateThrottle.THROTTLE_RATES, _TEST_THROTTLE_RATES)
class ShareTokenGlobalThrottleTest(APITestCase):
    """Tests for ShareTokenGlobalThrottle (per-token limit)."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="pass1234"
        )
        from app.models import VideoGroup

        self.group = VideoGroup.objects.create(
            user=self.user,
            name="test group",
            share_token=secrets.token_urlsafe(32),
        )
        self.url = f"/api/chat/?share_token={self.group.share_token}"
        self.payload = {
            "messages": [{"role": "user", "content": "hi"}],
            "group_id": self.group.id,
        }

    def test_per_token_limit_reached(self):
        """After global token limit (3/min), even different IPs get blocked."""
        # Per-IP is 2/min, per-token is 3/min. Use different IPs to avoid
        # hitting the IP limit first.
        for i in range(3):
            resp = self.client.post(
                self.url,
                self.payload,
                format="json",
                REMOTE_ADDR=f"10.0.0.{i + 1}",
            )
            self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # 4th request — new IP but same token → token-level throttle fires
        resp = self.client.post(
            self.url,
            self.payload,
            format="json",
            REMOTE_ADDR="10.0.0.99",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(CACHES=_TEST_CACHES, ENABLE_SIGNUP=True)
@patch.dict(SimpleRateThrottle.THROTTLE_RATES, _TEST_THROTTLE_RATES)
class AuthenticatedChatThrottleTest(APITestCase):
    """Tests for AuthenticatedChatThrottle (per-user limit)."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="chatuser", email="chat@example.com", password="pass1234"
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/api/chat/"

    def test_blocks_authenticated_user_after_limit(self):
        """Authenticated user is throttled after 2 requests/min."""
        for _ in range(2):
            resp = self.client.post(
                self.url,
                {"messages": [{"role": "user", "content": "hi"}]},
                format="json",
            )
            self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        resp = self.client.post(
            self.url,
            {"messages": [{"role": "user", "content": "hi"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_different_users_have_separate_limits(self):
        """Different users should not share throttle counters."""
        for _ in range(2):
            self.client.post(
                self.url,
                {"messages": [{"role": "user", "content": "hi"}]},
                format="json",
            )

        user2 = User.objects.create_user(
            username="chatuser2", email="chat2@example.com", password="pass1234"
        )
        self.client.force_authenticate(user=user2)
        resp = self.client.post(
            self.url,
            {"messages": [{"role": "user", "content": "hi"}]},
            format="json",
        )
        self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(CACHES=_TEST_CACHES, ENABLE_SIGNUP=True)
@patch.dict(SimpleRateThrottle.THROTTLE_RATES, _TEST_THROTTLE_RATES)
class LoginThrottleTest(APITestCase):
    """Tests for LoginIPThrottle and LoginUsernameThrottle."""

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="loginuser", email="login@example.com", password="pass1234"
        )
        self.url = "/api/auth/login/"

    def test_ip_throttle_blocks_after_limit(self):
        """Same IP is blocked after 2 login attempts/min."""
        for _ in range(2):
            resp = self.client.post(
                self.url,
                {"username": "loginuser", "password": "wrong"},
                format="json",
            )
            self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        resp = self.client.post(
            self.url,
            {"username": "loginuser", "password": "wrong"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_username_throttle_across_different_ips(self):
        """Same username from different IPs should still be blocked."""
        for i in range(2):
            resp = self.client.post(
                self.url,
                {"username": "loginuser", "password": "wrong"},
                format="json",
                REMOTE_ADDR=f"10.0.0.{i + 1}",
            )
            self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # 3rd attempt — new IP but same username
        resp = self.client.post(
            self.url,
            {"username": "loginuser", "password": "wrong"},
            format="json",
            REMOTE_ADDR="10.0.0.99",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(CACHES=_TEST_CACHES, ENABLE_SIGNUP=True)
@patch.dict(SimpleRateThrottle.THROTTLE_RATES, _TEST_THROTTLE_RATES)
class SignupThrottleTest(APITestCase):
    """Tests for SignupIPThrottle."""

    def setUp(self):
        cache.clear()
        self.url = "/api/auth/signup/"

    def test_blocks_after_limit(self):
        """Same IP is blocked after 2 signup attempts/min."""
        for i in range(2):
            resp = self.client.post(
                self.url,
                {
                    "username": f"newuser{i}",
                    "email": f"new{i}@example.com",
                    "password": "StrongP@ss1",
                    "password_confirm": "StrongP@ss1",
                },
                format="json",
            )
            self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        resp = self.client.post(
            self.url,
            {
                "username": "newuser99",
                "email": "new99@example.com",
                "password": "StrongP@ss1",
                "password_confirm": "StrongP@ss1",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


@override_settings(CACHES=_TEST_CACHES, ENABLE_SIGNUP=True)
@patch.dict(SimpleRateThrottle.THROTTLE_RATES, _TEST_THROTTLE_RATES)
class PasswordResetThrottleTest(APITestCase):
    """Tests for PasswordResetIPThrottle and PasswordResetEmailThrottle."""

    def setUp(self):
        cache.clear()
        self.url = "/api/auth/password-reset/"

    def test_ip_throttle_blocks_after_limit(self):
        """Same IP is blocked after 2 password reset attempts/min."""
        for i in range(2):
            resp = self.client.post(
                self.url,
                {"email": f"user{i}@example.com"},
                format="json",
            )
            self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        resp = self.client.post(
            self.url,
            {"email": "user99@example.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_email_throttle_across_different_ips(self):
        """Same email from different IPs should still be blocked."""
        target_email = "victim@example.com"
        for i in range(2):
            resp = self.client.post(
                self.url,
                {"email": target_email},
                format="json",
                REMOTE_ADDR=f"10.0.0.{i + 1}",
            )
            self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # 3rd attempt — new IP but same email
        resp = self.client.post(
            self.url,
            {"email": target_email},
            format="json",
            REMOTE_ADDR="10.0.0.99",
        )
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_429_response_format(self):
        """429 response should have LIMIT_EXCEEDED error format with Retry-After header."""
        for _ in range(2):
            self.client.post(self.url, {"email": "test@example.com"}, format="json")

        resp = self.client.post(self.url, {"email": "test@example.com"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(resp.json()["error"]["code"], "LIMIT_EXCEEDED")
        self.assertIn("Retry-After", resp)
