import importlib
import os
import sys
import unittest

from django.core.exceptions import ImproperlyConfigured


class SecuritySettingsTests(unittest.TestCase):
    SETTINGS_MODULE = "videoq.settings"
    TARGET_ENV_KEYS = [
        "DJANGO_ENV",
        "SECURE_SSL_REDIRECT",
        "SECURE_HSTS_SECONDS",
        "SECURE_HSTS_INCLUDE_SUBDOMAINS",
        "SECURE_HSTS_PRELOAD",
        "SECURE_PROXY_SSL_HEADER",
        "SECRET_KEY",
    ]

    def setUp(self):
        self._original_env = {key: os.environ.get(key) for key in self.TARGET_ENV_KEYS}

    def tearDown(self):
        for key, value in self._original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        sys.modules.pop(self.SETTINGS_MODULE, None)

    def _load_settings(self, **env):
        for key in self.TARGET_ENV_KEYS:
            os.environ.pop(key, None)
        os.environ.update(env)

        sys.modules.pop(self.SETTINGS_MODULE, None)
        return importlib.import_module(self.SETTINGS_MODULE)

    def test_production_defaults_enable_https_hardening(self):
        settings = self._load_settings(
            DJANGO_ENV="production", SECRET_KEY="test-production-secret-key"
        )

        self.assertTrue(settings.SECURE_COOKIES)
        self.assertTrue(settings.SESSION_COOKIE_SECURE)
        self.assertTrue(settings.CSRF_COOKIE_SECURE)
        self.assertEqual(settings.SESSION_COOKIE_SAMESITE, "None")
        self.assertEqual(settings.CSRF_COOKIE_SAMESITE, "None")
        self.assertTrue(settings.SECURE_SSL_REDIRECT)
        self.assertGreaterEqual(settings.SECURE_HSTS_SECONDS, 31536000)
        self.assertTrue(settings.SECURE_HSTS_INCLUDE_SUBDOMAINS)
        self.assertTrue(settings.SECURE_HSTS_PRELOAD)
        self.assertEqual(
            settings.SECURE_PROXY_SSL_HEADER, ("HTTP_X_FORWARDED_PROTO", "https")
        )

    def test_development_defaults_keep_hardening_disabled(self):
        settings = self._load_settings(DJANGO_ENV="development")

        self.assertFalse(settings.SECURE_COOKIES)
        self.assertFalse(settings.SESSION_COOKIE_SECURE)
        self.assertFalse(settings.CSRF_COOKIE_SECURE)
        self.assertEqual(settings.SESSION_COOKIE_SAMESITE, "Lax")
        self.assertEqual(settings.CSRF_COOKIE_SAMESITE, "Lax")
        self.assertFalse(settings.SECURE_SSL_REDIRECT)
        self.assertEqual(settings.SECURE_HSTS_SECONDS, 0)
        self.assertFalse(settings.SECURE_HSTS_INCLUDE_SUBDOMAINS)
        self.assertFalse(settings.SECURE_HSTS_PRELOAD)
        self.assertIsNone(settings.SECURE_PROXY_SSL_HEADER)

    def test_security_env_overrides_are_ignored(self):
        production_settings = self._load_settings(
            DJANGO_ENV="production",
            SECRET_KEY="test-production-secret-key",
            SECURE_SSL_REDIRECT="false",
            SECURE_HSTS_SECONDS="0",
            SECURE_HSTS_INCLUDE_SUBDOMAINS="false",
            SECURE_HSTS_PRELOAD="false",
            SECURE_PROXY_SSL_HEADER="HTTP_X_CUSTOM_PROTO,https",
        )

        self.assertTrue(production_settings.SECURE_COOKIES)
        self.assertTrue(production_settings.SESSION_COOKIE_SECURE)
        self.assertTrue(production_settings.CSRF_COOKIE_SECURE)
        self.assertTrue(production_settings.SECURE_SSL_REDIRECT)
        self.assertEqual(production_settings.SECURE_HSTS_SECONDS, 31536000)
        self.assertTrue(production_settings.SECURE_HSTS_INCLUDE_SUBDOMAINS)
        self.assertTrue(production_settings.SECURE_HSTS_PRELOAD)
        self.assertEqual(
            production_settings.SECURE_PROXY_SSL_HEADER,
            ("HTTP_X_FORWARDED_PROTO", "https"),
        )

        development_settings = self._load_settings(
            DJANGO_ENV="development",
            SECURE_SSL_REDIRECT="true",
            SECURE_HSTS_SECONDS="999999999",
            SECURE_HSTS_INCLUDE_SUBDOMAINS="true",
            SECURE_HSTS_PRELOAD="true",
            SECURE_PROXY_SSL_HEADER="HTTP_X_FORWARDED_PROTO,https",
        )

        self.assertFalse(development_settings.SECURE_COOKIES)
        self.assertFalse(development_settings.SESSION_COOKIE_SECURE)
        self.assertFalse(development_settings.CSRF_COOKIE_SECURE)
        self.assertFalse(development_settings.SECURE_SSL_REDIRECT)
        self.assertEqual(development_settings.SECURE_HSTS_SECONDS, 0)
        self.assertFalse(development_settings.SECURE_HSTS_INCLUDE_SUBDOMAINS)
        self.assertFalse(development_settings.SECURE_HSTS_PRELOAD)
        self.assertIsNone(development_settings.SECURE_PROXY_SSL_HEADER)

    def test_production_raises_when_secret_key_is_missing(self):
        with self.assertRaises(ImproperlyConfigured):
            self._load_settings(DJANGO_ENV="production")

    def test_production_raises_when_secret_key_is_blank(self):
        with self.assertRaises(ImproperlyConfigured):
            self._load_settings(DJANGO_ENV="production", SECRET_KEY="   ")

    def test_development_allows_missing_secret_key(self):
        settings = self._load_settings(DJANGO_ENV="development")
        self.assertEqual(settings.SECRET_KEY, settings.DefaultSettings.SECRET_KEY)


if __name__ == "__main__":
    unittest.main()
