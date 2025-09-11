from django.test import TestCase, Client, override_settings
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from app.models import Video


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class BasicViewTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.User = get_user_model()
        self.user = self.User.objects.create_user(
            username="user", email="u@example.com", password="pass"
        )

    def test_login_required_pages_redirect(self):
        for name in [
            "app:home",
            "app:upload_video",
            "app:video_list",
        ]:
            resp = self.client.get(reverse(name))
            self.assertIn(resp.status_code, (302, 301))

    def test_home_context_authenticated(self):
        self.client.login(username="user", password="pass")
        resp = self.client.get(reverse("app:home"))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("video_groups", resp.context)

    def test_video_upload_view_limit_enforced(self):
        self.client.login(username="user", password="pass")
        # Set user limit to 0
        self.user.video_limit = 0
        self.user.save()

        file = SimpleUploadedFile("a.mp4", b"data", content_type="video/mp4")
        resp = self.client.post(
            reverse("app:upload_video"),
            data={"title": "t", "description": "d", "file": file},
            HTTP_X_REQUESTED_WITH="XMLHttpRequest",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertJSONEqual(
            resp.content.decode(),
            {
                "success": False,
                "errors": {"file": ["Video limit reached (0 videos). Please delete some videos first."]},
            },
        )
