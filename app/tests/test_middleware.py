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
        # Health endpoint is exempt
        resp = self.client.get("/health/")
        self.assertEqual(resp.status_code, 200)
        
        # Test a protected endpoint - use a simple endpoint that doesn't require Django auth
        resp = self.client.get("/upload/")
        self.assertEqual(resp.status_code, 401)

        # Authentication successful with Basic header
        import base64

        token = base64.b64encode(b"admin:password").decode("utf-8")
        resp2 = self.client.get("/upload/", HTTP_AUTHORIZATION=f"Basic {token}")
        # After authentication, 302/200 is fine for CSRF etc., but not 401
        self.assertNotEqual(resp2.status_code, 401)
