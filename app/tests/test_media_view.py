from django.test import TestCase, Client, override_settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from app.models import Video, VideoGroup


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    MEDIA_ROOT="/tmp/videoq_test_media",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class ProtectedMediaTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.user = User.objects.create_user(
            username="m", email="m@example.com", password="pass"
        )
        self.video = Video.objects.create(
            user=self.user,
            file=SimpleUploadedFile(
                "media_test.mp4", b"data", content_type="video/mp4"
            ),
            title="vt",
            description="",
            status="completed",
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")
        self.group.share_token = "share123"
        self.group.save()
        self.group.videos.add(self.video)

    def test_protected_media_requires_login_or_share_token(self):
        # 未ログインかつ無効トークン
        resp = self.client.get(
            f"/media/videos/{self.user.id}/{self.video.file.name.split('/')[-1]}"
        )
        self.assertIn(resp.status_code, (302, 401, 403))

        # 共有トークンで許可
        resp2 = self.client.get(
            f"/media/videos/{self.user.id}/{self.video.file.name.split('/')[-1]}",
            data={"share_token": self.group.share_token},
        )
        # Nginx連携ヘッダが付与される想定
        self.assertEqual(resp2.status_code, 200)
        self.assertIn("X-Accel-Redirect", resp2.headers)
