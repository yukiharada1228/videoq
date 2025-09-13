from django.conf import settings
from django.test import Client, TestCase, override_settings
from django.urls import resolve, reverse


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class HealthAndUrlsTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_health_check(self):
        url = reverse("app:health_check")
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode(), "OK")

    def test_root_resolves_to_home(self):
        resolver = resolve("/")
        self.assertEqual(resolver.app_name, "app")
