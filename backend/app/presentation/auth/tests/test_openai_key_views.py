"""Tests for OpenAI API key management views."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class OpenAiApiKeyViewTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="pass1234"
        )
        self.url = reverse("auth-openai-api-key")

    def _authenticate(self):
        self.client.force_authenticate(user=self.user)

    # --- Unauthenticated ---
    def test_get_unauthenticated_returns_401(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_put_unauthenticated_returns_401(self):
        response = self.client.put(self.url, {"api_key": "sk-test"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_delete_unauthenticated_returns_401(self):
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- GET ---
    def test_get_status_no_key(self):
        self._authenticate()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["has_key"])
        self.assertIsNone(response.data["masked_key"])
        self.assertIn("is_required", response.data)

    def test_get_status_with_key(self):
        self._authenticate()
        self.client.put(self.url, {"api_key": "sk-proj-abcdefgh1234"}, format="json")
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["has_key"])
        self.assertEqual(response.data["masked_key"], "sk-...1234")

    # --- PUT ---
    def test_put_save_key(self):
        self._authenticate()
        response = self.client.put(
            self.url, {"api_key": "sk-test1234"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "OpenAI API key saved.")

    def test_put_empty_key_returns_400(self):
        self._authenticate()
        response = self.client.put(self.url, {"api_key": ""}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_put_missing_key_returns_400(self):
        self._authenticate()
        response = self.client.put(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- DELETE ---
    def test_delete_key(self):
        self._authenticate()
        self.client.put(self.url, {"api_key": "sk-to-delete"}, format="json")
        response = self.client.delete(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "OpenAI API key deleted.")

        # Verify key is gone
        response = self.client.get(self.url)
        self.assertFalse(response.data["has_key"])
