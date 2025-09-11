from django.test import TestCase, Client, override_settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from app.models import VideoGroup, VideoGroupChatLog


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class ChatLogViewsTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.user = User.objects.create_user(
            username="c", email="c@example.com", password="pass"
        )
        self.client.login(username="c", password="pass")
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")

        # Create some dummy logs
        for i in range(3):
            VideoGroupChatLog.objects.create(
                group=self.group,
                owner=self.user,
                source="owner",
                question=f"q{i}",
                answer=f"a{i}",
                approx_size=10,
            )

    def test_chat_logs_dashboard(self):
        url = reverse("app:chat_logs_dashboard")
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("logs", resp.context)

    def test_chat_logs_export_csv(self):
        url = reverse("app:chat_log_export") + "?format=csv"
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp.headers.get("Content-Type", ""))

    def test_chat_logs_delete_single(self):
        log = VideoGroupChatLog.objects.first()
        url = reverse("app:chat_log_delete", args=[log.id])
        resp = self.client.post(url)
        self.assertIn(resp.status_code, (302, 200))

    def test_chat_logs_bulk_delete(self):
        url = reverse("app:chat_log_bulk_delete")
        resp = self.client.post(url, data={})
        self.assertIn(resp.status_code, (302, 200))
