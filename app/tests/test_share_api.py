from django.test import TestCase, Client, override_settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from unittest.mock import patch, MagicMock
from app.models import Video, VideoGroup
from app.crypto_utils import encrypt_api_key
from django.urls import reverse


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class ShareApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        User = get_user_model()
        self.owner = User.objects.create_user(
            username="owner", email="o@example.com", password="pass"
        )
        self.video = Video.objects.create(
            user=self.owner,
            file=SimpleUploadedFile("v.mp4", b"data", content_type="video/mp4"),
            title="v1",
            description="",
            status="completed",
        )
        self.group = VideoGroup.objects.create(
            user=self.owner, name="G", description=""
        )
        self.group.share_token = "t123"
        self.group.save()
        self.group.videos.add(self.video)

    @patch("app.share_access_service.redis")
    @patch("app.views.VectorSearchFactory.create_search_service")
    def test_share_group_chat(self, factory, mock_redis):
        # 共有元ユーザーに有効なAPIキーを設定
        self.owner.encrypted_openai_api_key = encrypt_api_key("sk-test")
        self.owner.save()

        # Redisモック（ミドルウェアのセッション登録をパスさせる）
        client = mock_redis.from_url.return_value
        client.smembers.return_value = set()
        client.scard.return_value = 0

        svc = MagicMock()
        svc.generate_group_rag_answer.return_value = {"rag_answer": "ans"}
        factory.return_value = svc
        url = reverse("app:share_video_group_chat", args=[self.group.share_token])
        resp = self.client.post(
            url, data={"query": "hello"}, content_type="application/json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertJSONEqual(
            resp.content.decode(), {"success": True, "results": {"rag_answer": "ans"}}
        )
