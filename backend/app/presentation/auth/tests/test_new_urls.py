"""
TDD tests for new REST URL patterns in auth domain (issue #651).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()


class TokensRefreshPostTests(APITestCase):
    """POST /api/auth/tokens/ replaces PUT for token refresh."""

    def test_post_to_tokens_refreshes_token(self):
        """POST /api/auth/tokens/ should work (was PUT)."""
        url = reverse("auth-tokens")
        # No refresh cookie → returns 401 (invalid token), but proves POST is accepted
        response = self.client.post(url)
        # 401 means routing worked (no cookie), not 405 Method Not Allowed
        self.assertNotEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_put_to_tokens_is_no_longer_accepted(self):
        """PUT /api/auth/tokens/ should return 405 Method Not Allowed."""
        url = reverse("auth-tokens")
        response = self.client.put(url)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    ENABLE_SIGNUP=True,
)
class EmailVerificationPathParamTests(APITestCase):
    """PATCH /api/auth/email-verifications/{uid}/{token}/ replaces POST with body."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="verify_path_user",
            email="verify_path@example.com",
            password="SecurePass123",
            is_active=False,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        from django.contrib.auth.tokens import default_token_generator
        self.token = default_token_generator.make_token(self.user)

    def test_patch_email_verification_with_path_params_returns_200(self):
        """PATCH /api/auth/email-verifications/{uid}/{token}/ verifies email."""
        url = reverse(
            "auth-email-verifications-confirm",
            kwargs={"uidb64": self.uid, "token": self.token},
        )
        response = self.client.patch(url, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_patch_with_invalid_token_returns_400(self):
        url = reverse(
            "auth-email-verifications-confirm",
            kwargs={"uidb64": self.uid, "token": "invalid-token"},
        )
        response = self.client.patch(url, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_to_email_verifications_is_no_longer_accepted(self):
        """POST /api/auth/email-verifications/ should return 405 or 404."""
        url = reverse("auth-email-verifications")
        response = self.client.post(url, {"uid": self.uid, "token": self.token}, format="json")
        self.assertIn(
            response.status_code,
            [status.HTTP_405_METHOD_NOT_ALLOWED, status.HTTP_404_NOT_FOUND],
        )


class PasswordResetConfirmPathParamTests(APITestCase):
    """PATCH /api/auth/password-resets/{uid}/{token}/ replaces /{token}/ with uid in body."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="reset_path_user",
            email="reset_path@example.com",
            password="OldPass123",
            is_active=True,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)

    def test_confirm_password_reset_with_uid_and_token_in_path(self):
        """PATCH with uid AND token in URL path, only new_password in body."""
        url = reverse(
            "auth-password-resets-confirm",
            kwargs={"uidb64": self.uid, "token": self.token},
        )
        response = self.client.patch(url, {"new_password": "NewSecret456"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecret456"))

    def test_confirm_with_invalid_token_returns_400(self):
        url = reverse(
            "auth-password-resets-confirm",
            kwargs={"uidb64": self.uid, "token": "invalid-token"},
        )
        response = self.client.patch(url, {"new_password": "NewSecret456"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_body_does_not_accept_uid_field(self):
        """uid must come from URL path, not body."""
        url = reverse(
            "auth-password-resets-confirm",
            kwargs={"uidb64": self.uid, "token": self.token},
        )
        # Sending uid in body should be ignored (uid comes from URL)
        response = self.client.patch(
            url, {"new_password": "NewSecret456", "uid": "garbage"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class AuthDeleteReturns204Tests(APITestCase):
    """DELETE endpoints in auth domain should return 204 No Content."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="auth_delete_user",
            email="auth_delete@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_logout_returns_204(self):
        """DELETE /api/auth/sessions/ should return 204."""
        url = reverse("auth-sessions")
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_delete_account_returns_204(self):
        """DELETE /api/auth/account/ should return 204."""
        url = reverse("auth-account-delete")
        response = self.client.delete(url, format="json")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_revoke_api_key_returns_204(self):
        """DELETE /api/auth/api-keys/{pk}/ should return 204."""
        from django.apps import apps
        UserApiKey = apps.get_model("app", "UserApiKey")
        import secrets as sec
        raw_key = sec.token_hex(32)
        api_key = UserApiKey.objects.create(
            user=self.user,
            name="test-key",
            hashed_key=UserApiKey.hash_key(raw_key),
            prefix=raw_key[:8],
            access_level="all",
        )
        url = reverse("auth-api-key-detail", kwargs={"pk": api_key.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
