"""Tests for shared provider-registry helpers."""

from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from app.domain.shared.exceptions import ProviderConfigError
from app.infrastructure.common.provider_registry import resolve_openai_api_key


class ResolveOpenAIApiKeyTests(SimpleTestCase):
    """resolve_openai_api_key key-resolution precedence and fallbacks."""

    def test_explicit_key_takes_precedence(self):
        with override_settings(OPENAI_API_KEY="settings-key"):
            self.assertEqual(
                resolve_openai_api_key("explicit-key"), "explicit-key"
            )

    @override_settings(OPENAI_API_KEY="settings-key")
    def test_falls_back_to_django_settings(self):
        self.assertEqual(resolve_openai_api_key(), "settings-key")

    @override_settings(OPENAI_API_KEY="")
    @patch.dict("os.environ", {"OPENAI_API_KEY": "env-key"}, clear=False)
    def test_falls_back_to_os_environ_when_settings_empty(self):
        # Regression: on Lambda the app secret is expanded into os.environ early,
        # but settings.OPENAI_API_KEY (assigned late in settings.py) can be empty
        # if a cold-start init times out. os.environ must be the reliable source.
        self.assertEqual(resolve_openai_api_key(), "env-key")

    @override_settings(OPENAI_API_KEY="")
    @patch.dict("os.environ", {"OPENAI_API_KEY": "env-key"}, clear=False)
    def test_no_env_fallback_when_settings_fallback_disabled(self):
        with self.assertRaises(ProviderConfigError):
            resolve_openai_api_key(allow_settings_fallback=False)

    @override_settings(OPENAI_API_KEY="")
    def test_raises_when_no_key_anywhere(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(ProviderConfigError):
                resolve_openai_api_key(purpose="OpenAI embeddings")
