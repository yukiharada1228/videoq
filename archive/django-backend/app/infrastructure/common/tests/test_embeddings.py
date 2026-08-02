"""Tests for shared embedding provider creation."""

from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from pydantic import SecretStr

from app.domain.shared.exceptions import ProviderConfigError
from app.infrastructure.common.embeddings import get_embeddings


class GetEmbeddingsTests(SimpleTestCase):
    """Tests for get_embeddings provider selection."""

    @patch("app.infrastructure.common.embeddings.OpenAIEmbeddings")
    @override_settings(
        EMBEDDING_PROVIDER="openai",
        EMBEDDING_MODEL="text-embedding-3-small",
        OPENAI_API_KEY="server-openai-key",
    )
    def test_creates_openai_embeddings_from_django_settings(self, mock_openai):
        get_embeddings()

        mock_openai.assert_called_once_with(
            model="text-embedding-3-small",
            api_key=SecretStr("server-openai-key"),
        )

    @patch("app.infrastructure.common.embeddings.OllamaEmbeddings")
    @override_settings(
        EMBEDDING_PROVIDER="ollama",
        EMBEDDING_MODEL="qwen3-embedding:0.6b",
        OLLAMA_BASE_URL="http://localhost:11434",
        OPENAI_API_KEY="",
    )
    def test_creates_ollama_embeddings(self, mock_ollama):
        get_embeddings()

        mock_ollama.assert_called_once_with(
            model="qwen3-embedding:0.6b",
            base_url="http://localhost:11434",
        )

    @override_settings(
        EMBEDDING_PROVIDER="openai",
        EMBEDDING_MODEL="text-embedding-3-small",
        OPENAI_API_KEY="",
    )
    def test_openai_embeddings_require_api_key(self):
        with self.assertRaises(ProviderConfigError) as context:
            get_embeddings()

        self.assertIn("OpenAI API key", str(context.exception))

    @override_settings(EMBEDDING_PROVIDER="unknown_provider")
    def test_invalid_embedding_provider_raises_provider_config_error(self):
        with self.assertRaises(ProviderConfigError) as context:
            get_embeddings()

        self.assertIn("Invalid EMBEDDING_PROVIDER", str(context.exception))
