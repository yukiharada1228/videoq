"""Tests for Whisper provider configuration and client creation."""

import os
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from app.domain.shared.exceptions import ProviderConfigError
from app.infrastructure.common.whisper_client import (
    WhisperConfig,
    create_async_whisper_client,
    create_whisper_client,
    get_whisper_model_name,
)


class WhisperConfigTests(SimpleTestCase):
    """Tests for WhisperConfig settings resolution."""

    @patch.dict(
        os.environ,
        {
            "WHISPER_BACKEND": "openai",
            "WHISPER_LOCAL_URL": "http://env-value:8080",
        },
    )
    @override_settings(
        WHISPER_BACKEND="whisper.cpp",
        WHISPER_LOCAL_URL="http://settings-value:8080",
    )
    def test_reads_django_settings_instead_of_environment_directly(self):
        config = WhisperConfig()

        self.assertEqual(config.backend, "whisper.cpp")
        self.assertEqual(config.local_url, "http://settings-value:8080")
        self.assertTrue(config.is_local())
        self.assertFalse(config.is_openai())

    @override_settings(WHISPER_BACKEND="invalid")
    def test_invalid_backend_raises_provider_config_error(self):
        with self.assertRaises(ProviderConfigError) as context:
            WhisperConfig()

        self.assertIn("Invalid WHISPER_BACKEND", str(context.exception))


class CreateWhisperClientTests(SimpleTestCase):
    """Tests for sync and async Whisper client factories."""

    @patch("app.infrastructure.common.whisper_client.OpenAI")
    @override_settings(WHISPER_BACKEND="openai", OPENAI_API_KEY="server-key")
    def test_openai_client_uses_settings_api_key_fallback(self, mock_openai):
        create_whisper_client(api_key=None)

        mock_openai.assert_called_once_with(api_key="server-key")

    @patch("app.infrastructure.common.whisper_client.OpenAI")
    @override_settings(
        WHISPER_BACKEND="whisper.cpp",
        WHISPER_LOCAL_URL="http://localhost:8080",
        OPENAI_API_KEY="",
    )
    def test_local_client_uses_dummy_key_and_local_url(self, mock_openai):
        create_whisper_client(api_key=None)

        mock_openai.assert_called_once_with(
            api_key="dummy-key-for-local",
            base_url="http://localhost:8080",
        )

    @patch("app.infrastructure.common.whisper_client.AsyncOpenAI")
    @override_settings(
        WHISPER_BACKEND="whisper.cpp",
        WHISPER_LOCAL_URL="http://localhost:8080",
        OPENAI_API_KEY="",
    )
    def test_async_local_client_uses_dummy_key_and_local_url(self, mock_async_openai):
        create_async_whisper_client(api_key=None)

        mock_async_openai.assert_called_once_with(
            api_key="dummy-key-for-local",
            base_url="http://localhost:8080",
        )

    @override_settings(WHISPER_BACKEND="openai", OPENAI_API_KEY="")
    def test_openai_client_requires_api_key(self):
        with self.assertRaises(ProviderConfigError) as context:
            create_whisper_client(api_key=None)

        self.assertIn("OpenAI API key", str(context.exception))

    @override_settings(
        WHISPER_BACKEND="whisper.cpp",
        WHISPER_LOCAL_URL="http://localhost:8080",
    )
    def test_local_model_name(self):
        self.assertEqual(get_whisper_model_name(), "whisper-local")

    @override_settings(WHISPER_BACKEND="openai")
    def test_openai_model_name(self):
        self.assertEqual(get_whisper_model_name(), "whisper-1")
