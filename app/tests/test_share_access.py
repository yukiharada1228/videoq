from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings

from app.models import VideoGroup


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class ShareAccessTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.user = User.objects.create_user(
            username="share", email="s@example.com", password="pass"
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")
        self.group.share_token = "tok123"
        self.group.save()

    @patch("app.share_access_service.redis")
    def test_share_page_sets_session_cookie(self, mock_redis):
        # Basic return values for Redis mock
        client = mock_redis.from_url.return_value
        client.smembers.return_value = set()
        client.scard.return_value = 0

        resp = self.client.get(f"/share/group/{self.group.share_token}/")
        # Session ID is assigned
        self.assertIn("share_session_id", resp.cookies)
