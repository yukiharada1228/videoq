"""Admin-level transactional behavior for video_limit enforcement."""

from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase

from app.admin import CustomUserAdmin

User = get_user_model()


class CustomUserAdminVideoLimitTransactionTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.admin = CustomUserAdmin(User, AdminSite())
        self.user = User.objects.create_user(
            username="video-limit-user",
            email="video-limit-user@example.com",
            password="testpass123",
            video_limit=5,
        )

    def test_save_model_rolls_back_video_limit_when_enforcement_fails(self):
        request = self.factory.post("/admin/app/user/1/change/")
        self.user.video_limit = 1
        form = SimpleNamespace(changed_data=["video_limit"])

        use_case = Mock()
        use_case.estimate_deleted_count.return_value = 0
        use_case.execute.side_effect = RuntimeError("enforcement failed")

        with patch("app.admin.get_enforce_video_limit_use_case", return_value=use_case):
            with self.assertRaises(RuntimeError):
                self.admin.save_model(request, self.user, form, change=True)

        self.user.refresh_from_db()
        self.assertEqual(self.user.video_limit, 5)

