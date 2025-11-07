from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class PasswordChangeAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="Oldpass123!",
        )
        self.url = reverse("auth-password-change")
        self.client.force_authenticate(user=self.user)

    def test_change_password_success(self):
        payload = {
            "current_password": "Oldpass123!",
            "new_password": "Newpass456!",
            "new_password_confirm": "Newpass456!",
        }
        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["detail"], "パスワードを変更しました。")

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Newpass456!"))

    def test_change_password_with_wrong_current_password(self):
        payload = {
            "current_password": "wrongpass",
            "new_password": "Newpass456!",
            "new_password_confirm": "Newpass456!",
        }
        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("current_password", response.data)

    def test_change_password_with_mismatch(self):
        payload = {
            "current_password": "Oldpass123!",
            "new_password": "Newpass456!",
            "new_password_confirm": "Otherpass789!",
        }
        response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_password_confirm", response.data)
