from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailChangeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="SecurePass123",
            is_active=True,
        )
        self.client.force_authenticate(user=self.user)
        self.request_url = reverse("auth-me-email")

    def test_request_keeps_current_email_and_sends_confirmation_to_new_email(self):
        response = self.client.patch(
            self.request_url,
            {"email": "  New@Example.COM  "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["message"],
            "Email change confirmation sent. Please check your new email address.",
        )

        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "alice@example.com")
        self.assertEqual(self.user.pending_email, "new@example.com")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["new@example.com"])
        self.assertIn("/change-email", mail.outbox[0].body)

    def test_confirmation_updates_email_and_clears_pending_email(self):
        request_response = self.client.patch(
            self.request_url,
            {"email": "new@example.com"},
            format="json",
        )
        self.assertEqual(request_response.status_code, status.HTTP_200_OK)

        change_url = next(
            line
            for line in mail.outbox[0].body.splitlines()
            if line.startswith("http")
        )
        parsed = urlparse(change_url)
        params = {key: values[0] for key, values in parse_qs(parsed.query).items()}
        confirm_url = reverse(
            "auth-email-change-confirm",
            kwargs={"uidb64": params["uid"], "token": params["token"]},
        )

        response = self.client.patch(confirm_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "Email address updated.")
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")
        self.assertIsNone(self.user.pending_email)

    def test_confirmation_with_invalid_token_does_not_update_email(self):
        self.client.patch(
            self.request_url,
            {"email": "new@example.com"},
            format="json",
        )
        self.user.refresh_from_db()
        confirm_url = reverse(
            "auth-email-change-confirm",
            kwargs={"uidb64": "bad-uid", "token": "bad-token"},
        )

        response = self.client.patch(confirm_url, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "alice@example.com")
        self.assertEqual(self.user.pending_email, "new@example.com")

    def test_request_rejects_existing_email(self):
        User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="SecurePass123",
            is_active=True,
        )

        response = self.client.patch(
            self.request_url,
            {"email": "bob@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.pending_email)
        self.assertEqual(len(mail.outbox), 0)

    def test_request_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.patch(
            self.request_url,
            {"email": "new@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
