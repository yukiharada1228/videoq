from django.http import HttpResponse
from django.middleware.security import SecurityMiddleware
from django.test import RequestFactory, SimpleTestCase, override_settings


@override_settings(
    ALLOWED_HOSTS=["api.example.com", "testserver"],
    SECURE_SSL_REDIRECT=True,
    SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
)
class SecurityMiddlewareProxySSLTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.middleware = SecurityMiddleware(lambda request: HttpResponse("ok"))

    def test_forwarded_https_proto_skips_ssl_redirect(self):
        request = self.factory.get(
            "/api/docs/",
            HTTP_HOST="api.example.com",
            HTTP_X_FORWARDED_PROTO="https",
        )

        response = self.middleware(request)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get("Location"))

    def test_plain_http_request_redirects_to_https(self):
        request = self.factory.get("/api/docs/", HTTP_HOST="api.example.com")

        response = self.middleware(request)

        self.assertIn(response.status_code, (301, 302, 307, 308))
        self.assertEqual(response["Location"], "https://api.example.com/api/docs/")

    def test_redirect_converges_after_one_hop_behind_proxy(self):
        first_request = self.factory.get("/api/docs/", HTTP_HOST="api.example.com")
        first_response = self.middleware(first_request)

        second_request = self.factory.get(
            "/api/docs/",
            HTTP_HOST="api.example.com",
            HTTP_X_FORWARDED_PROTO="https",
        )
        second_response = self.middleware(second_request)

        self.assertIn(first_response.status_code, (301, 302, 307, 308))
        self.assertEqual(first_response["Location"], "https://api.example.com/api/docs/")
        self.assertEqual(second_response.status_code, 200)
