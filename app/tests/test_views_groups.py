from django.test import TestCase, Client, override_settings
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from app.models import Video, VideoGroup, Tag, VideoGroupMember


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class VideoGroupViewsTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.user = User.objects.create_user(
            username="grp", email="g@example.com", password="pass"
        )
        self.client.login(username="grp", password="pass")

        # Create one completed video
        self.video = Video.objects.create(
            user=self.user,
            file=SimpleUploadedFile("v.mp4", b"data", content_type="video/mp4"),
            title="v1",
            description="",
            status="completed",
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G", description="")

    def test_add_by_tags_missing_tag_returns_400(self):
        url = reverse("app:video_group_add_by_tags", args=[self.group.id])
        resp = self.client.post(
            url, data={"tags": "notfound"}, content_type="application/json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_add_by_tags_success(self):
        tag = Tag.objects.create(user=self.user, name="math")
        self.video.tags.add(tag)
        url = reverse("app:video_group_add_by_tags", args=[self.group.id])
        resp = self.client.post(
            url, data={"tags": ["math"]}, content_type="application/json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            VideoGroupMember.objects.filter(group=self.group, video=self.video).exists()
        )

    def test_share_toggle_enable_and_disable(self):
        url = reverse("app:video_group_share_toggle", args=[self.group.id])
        # enable
        resp = self.client.post(url, data={"action": "enable"})
        self.assertEqual(resp.status_code, 200)
        self.group.refresh_from_db()
        self.assertTrue(bool(self.group.share_token))
        # disable
        resp2 = self.client.post(url, data={"action": "disable"})
        self.assertEqual(resp2.status_code, 200)
        self.group.refresh_from_db()
        self.assertIsNone(self.group.share_token)
