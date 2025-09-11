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
        
        # Test Basic auth middleware directly
        from app.middleware import BasicAuthMiddleware
        from django.http import HttpRequest
        from django.test import RequestFactory
        
        # Create a mock request
        factory = RequestFactory()
        request = factory.get('/test/')
        
        # Create middleware instance
        middleware = BasicAuthMiddleware(lambda req: None)
        
        # Test without authentication
        response = middleware(request)
        self.assertEqual(response.status_code, 401)
        
        # Test with correct authentication
        request_with_auth = factory.get('/test/', HTTP_AUTHORIZATION='Basic YWRtaW46cGFzc3dvcmQ=')
        response = middleware(request_with_auth)
        self.assertIsNone(response)  # Should pass through to next middleware
