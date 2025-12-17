from urllib.parse import parse_qs, urlparse

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    ENABLE_SIGNUP=True,
)
class EmailVerificationTests(APITestCase):
    def test_signup_requires_email_verification(self):
        url = reverse("signup")
        payload = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "securepass123",
        }

        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            response.data["detail"],
            "Verification email sent. Please check your email.",
        )

        user = User.objects.get(username="newuser")
        self.assertFalse(user.is_active)
        self.assertEqual(len(mail.outbox), 1)

        # Extract UID and token from email body
        email_body = mail.outbox[0].body
        self.assertIn("/verify-email", email_body)

        # Assume URL is in the last line
        verification_url = email_body.strip().splitlines()[-1]
        self.assertTrue(verification_url.startswith("http"))

        # Extract uid and token for API endpoint
        try:
            parsed = urlparse(verification_url)
            query = parse_qs(parsed.query)
            params = {key: values[0] for key, values in query.items()}
        except Exception as exc:  # pragma: no cover
            self.fail(f"Failed to parse verification URL: {exc}")

        verify_url = reverse("auth-verify-email")
        verify_response = self.client.post(verify_url, params, format="json")

        self.assertEqual(verify_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            verify_response.data["detail"],
            "Email verification completed. Please sign in.",
        )

        user.refresh_from_db()
        self.assertTrue(user.is_active)
