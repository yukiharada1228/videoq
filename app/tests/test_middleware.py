from django.test import Client, TestCase, override_settings


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

        # Test Basic auth middleware directly with proper settings
        from django.conf import settings
        from django.test import RequestFactory

        from app.middleware import BasicAuthMiddleware

        # Create middleware instance with test settings
        middleware = BasicAuthMiddleware(lambda req: None)

        # Test without authentication
        factory = RequestFactory()
        request = factory.get("/test/")
        response = middleware(request)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response["WWW-Authenticate"], 'Basic realm="Restricted"')

        # Test with correct authentication
        import base64

        credentials = f"{settings.BASIC_AUTH_USERNAME}:{settings.BASIC_AUTH_PASSWORD}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        request_with_auth = factory.get(
            "/test/", HTTP_AUTHORIZATION=f"Basic {encoded_credentials}"
        )
        response = middleware(request_with_auth)
        self.assertIsNone(response)  # Should pass through to next middleware

        # Test with wrong authentication
        request_with_wrong_auth = factory.get(
            "/test/", HTTP_AUTHORIZATION="Basic d3Jvbmc6cGFzc3dvcmQ="
        )
        response = middleware(request_with_wrong_auth)
        self.assertEqual(response.status_code, 401)

        # Test with malformed authentication header
        request_with_malformed = factory.get(
            "/test/", HTTP_AUTHORIZATION="Basic invalid_base64"
        )
        response = middleware(request_with_malformed)
        self.assertEqual(response.status_code, 401)

        # Test with non-Basic authentication
        request_with_bearer = factory.get("/test/", HTTP_AUTHORIZATION="Bearer token")
        response = middleware(request_with_bearer)
        self.assertEqual(response.status_code, 401)

    def test_basic_auth_disabled(self):
        """Test that Basic auth can be disabled"""
        from django.test import RequestFactory, override_settings

        from app.middleware import BasicAuthMiddleware

        # Test with Basic auth disabled
        with override_settings(BASIC_AUTH_ENABLED=False):
            middleware = BasicAuthMiddleware(lambda req: "OK")
            factory = RequestFactory()
            request = factory.get("/test/")
            response = middleware(request)
            self.assertEqual(response, "OK")  # Should pass through without auth
