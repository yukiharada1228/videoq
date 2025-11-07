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
class PasswordResetRequestTests(APITestCase):
    def setUp(self):
        self.url = reverse("auth-password-reset")
        self.user = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="SecurePass123",
            is_active=True,
        )

    def test_request_sends_email_for_existing_user(self):
        response = self.client.post(self.url, {"email": self.user.email}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["detail"],
            "パスワードリセット用のメールを送信しました。メールをご確認ください。",
        )
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/reset-password", mail.outbox[0].body)

    def test_request_is_silent_for_unknown_email(self):
        response = self.client.post(
            self.url, {"email": "unknown@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)


class PasswordResetConfirmTests(APITestCase):
    def setUp(self):
        self.url = reverse("auth-password-reset-confirm")
        self.user = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="OldPass123",
            is_active=True,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)

    def test_confirm_updates_password(self):
        payload = {
            "uid": self.uid,
            "token": self.token,
            "new_password": "NewSecret456",
        }
        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["detail"],
            "パスワードをリセットしました。新しいパスワードでログインしてください。",
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecret456"))

    def test_confirm_with_invalid_token_fails(self):
        payload = {
            "uid": self.uid,
            "token": "invalid-token",
            "new_password": "NewSecret456",
        }
        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("トークンが無効", response.data["non_field_errors"][0])
