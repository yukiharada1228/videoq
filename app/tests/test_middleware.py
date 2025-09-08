from django.test import TestCase, Client, override_settings


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=True,
    BASIC_AUTH_USERNAME="admin",
    BASIC_AUTH_PASSWORD="password",
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class BasicAuthMiddlewareTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_health_exempt(self):
        resp = self.client.get("/health/")
        self.assertEqual(resp.status_code, 200)

    def test_requires_basic_auth(self):
        # 認証なし→401
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 401)

        # Basicヘッダで認証成功
        import base64

        token = base64.b64encode(b"admin:password").decode("utf-8")
        resp2 = self.client.get("/", HTTP_AUTHORIZATION=f"Basic {token}")
        # 認証後はCSRF等で302/200いずれでも良いが401ではないこと
        self.assertNotEqual(resp2.status_code, 401)
