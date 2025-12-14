"""
Tests for OpenAI API key management endpoints.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from app.utils.encryption import decrypt_api_key, encrypt_api_key

User = get_user_model()


class OpenAIApiKeyAPITestCase(APITestCase):
    """OpenAI API key management API tests"""

    def setUp(self):
        """Prepare test data"""
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.api_key = "sk-proj-test1234567890abcdefghijklmnopqrstuvwxyz"

    def test_set_api_key_success(self):
        """Test successfully setting an API key"""
        url = reverse("auth-set-openai-api-key")
        data = {"api_key": self.api_key}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "API key saved successfully")

        # Verify API key is encrypted and saved
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.openai_api_key_encrypted)
        decrypted_key = decrypt_api_key(self.user.openai_api_key_encrypted)
        self.assertEqual(decrypted_key, self.api_key)

    def test_set_api_key_invalid_format(self):
        """Test setting an API key with invalid format"""
        url = reverse("auth-set-openai-api-key")
        data = {"api_key": "invalid-key-format"}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("api_key", response.data)

    def test_set_api_key_missing_field(self):
        """Test setting an API key without providing the key"""
        url = reverse("auth-set-openai-api-key")
        data = {}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("api_key", response.data)

    def test_set_api_key_update_existing(self):
        """Test updating an existing API key"""
        # Set initial API key
        self.user.openai_api_key_encrypted = encrypt_api_key(self.api_key)
        self.user.save()

        # Update with new API key
        new_api_key = "sk-proj-new9876543210zyxwvutsrqponmlkjihgfedcba"
        url = reverse("auth-set-openai-api-key")
        data = {"api_key": new_api_key}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify new API key is saved
        self.user.refresh_from_db()
        decrypted_key = decrypt_api_key(self.user.openai_api_key_encrypted)
        self.assertEqual(decrypted_key, new_api_key)

    def test_get_api_key_status_with_key(self):
        """Test getting API key status when key is set"""
        self.user.openai_api_key_encrypted = encrypt_api_key(self.api_key)
        self.user.save()

        url = reverse("auth-get-openai-api-key-status")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["has_api_key"], True)

    def test_get_api_key_status_without_key(self):
        """Test getting API key status when key is not set"""
        url = reverse("auth-get-openai-api-key-status")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["has_api_key"], False)

    def test_get_api_key_status_does_not_return_actual_key(self):
        """Test that status endpoint does not return the actual API key"""
        self.user.openai_api_key_encrypted = encrypt_api_key(self.api_key)
        self.user.save()

        url = reverse("auth-get-openai-api-key-status")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("api_key", response.data)
        self.assertNotIn(self.api_key, str(response.data))

    def test_delete_api_key_success(self):
        """Test successfully deleting an API key"""
        self.user.openai_api_key_encrypted = encrypt_api_key(self.api_key)
        self.user.save()

        url = reverse("auth-delete-openai-api-key")
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "API key deleted successfully")

        # Verify API key is deleted
        self.user.refresh_from_db()
        self.assertIsNone(self.user.openai_api_key_encrypted)

    def test_delete_api_key_when_not_set(self):
        """Test deleting API key when it's not set"""
        url = reverse("auth-delete-openai-api-key")
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["message"], "API key deleted successfully")

    def test_api_key_endpoints_require_authentication(self):
        """Test that API key endpoints require authentication"""
        self.client.force_authenticate(user=None)

        # Test set endpoint
        url = reverse("auth-set-openai-api-key")
        response = self.client.post(url, {"api_key": self.api_key}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Test status endpoint
        url = reverse("auth-get-openai-api-key-status")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Test delete endpoint
        url = reverse("auth-delete-openai-api-key")
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_can_only_access_own_api_key(self):
        """Test that users can only access their own API key"""
        # Create another user with API key
        other_user = User.objects.create_user(
            username="otheruser",
            email="otheruser@example.com",
            password="testpass123",
        )
        other_user.openai_api_key_encrypted = encrypt_api_key("sk-proj-other-key")
        other_user.save()

        # Current user should not see other user's API key
        url = reverse("auth-get-openai-api-key-status")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["has_api_key"], False)
