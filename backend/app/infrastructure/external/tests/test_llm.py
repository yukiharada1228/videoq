"""
Tests for llm module
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from pydantic import SecretStr

from app.infrastructure.external.llm import get_langchain_llm
from app.domain.shared.exceptions import LLMConfigError

User = get_user_model()


class GetLangchainLLMTests(TestCase):
    """Tests for get_langchain_llm function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    @patch("app.infrastructure.external.llm.ChatOpenAI")
    @override_settings(
        LLM_PROVIDER="openai", OPENAI_API_KEY="test-api-key", LLM_MODEL="gpt-4o-mini"
    )
    def test_get_langchain_llm_with_api_key(self, mock_chat_openai):
        """Test get_langchain_llm when API key is configured via environment"""
        llm = get_langchain_llm(self.user)

        self.assertIsNotNone(llm)
        mock_chat_openai.assert_called_once_with(
            model="gpt-4o-mini",
            api_key=SecretStr("test-api-key"),
            temperature=0.0,
        )

    @patch("app.infrastructure.external.llm.ChatOpenAI")
    @override_settings(
        LLM_PROVIDER="openai", OPENAI_API_KEY="test-api-key", LLM_MODEL="gpt-4o"
    )
    def test_get_langchain_llm_with_custom_model(self, mock_chat_openai):
        """Test get_langchain_llm with custom LLM model from environment"""
        llm = get_langchain_llm(self.user)

        self.assertIsNotNone(llm)
        mock_chat_openai.assert_called_once_with(
            model="gpt-4o",
            api_key=SecretStr("test-api-key"),
            temperature=0.0,
        )

    @override_settings(
        LLM_PROVIDER="openai", OPENAI_API_KEY="", LLM_MODEL="gpt-4o-mini"
    )
    @patch.dict("os.environ", {"OPENAI_API_KEY": ""}, clear=False)
    def test_get_langchain_llm_without_api_key(self):
        """Test get_langchain_llm raises LLMConfigError when API key is not configured"""
        with self.assertRaises(LLMConfigError) as ctx:
            get_langchain_llm(self.user)
        self.assertIn("OPENAI_API_KEY", str(ctx.exception))

    @override_settings(
        LLM_PROVIDER="openai", OPENAI_API_KEY=None, LLM_MODEL="gpt-4o-mini"
    )
    @patch.dict("os.environ", {"OPENAI_API_KEY": ""}, clear=False)
    def test_get_langchain_llm_with_none_api_key(self):
        """Test get_langchain_llm raises LLMConfigError when API key is None"""
        with self.assertRaises(LLMConfigError) as ctx:
            get_langchain_llm(self.user)
        self.assertIn("OPENAI_API_KEY", str(ctx.exception))

    @patch("app.infrastructure.external.llm.ChatOllama")
    @override_settings(
        LLM_PROVIDER="ollama",
        LLM_MODEL="qwen3:8b",
        OLLAMA_BASE_URL="http://localhost:11434",
    )
    def test_get_langchain_llm_with_ollama_provider(self, mock_chat_ollama):
        """Test get_langchain_llm with Ollama provider using LLM_MODEL"""
        llm = get_langchain_llm(self.user)

        self.assertIsNotNone(llm)
        mock_chat_ollama.assert_called_once_with(
            model="qwen3:8b",
            base_url="http://localhost:11434",
            temperature=0.0,
        )

    @override_settings(LLM_PROVIDER="unknown_provider")
    def test_get_langchain_llm_with_invalid_provider(self):
        """Test get_langchain_llm raises LLMConfigError for unknown provider"""
        with self.assertRaises(LLMConfigError) as ctx:
            get_langchain_llm(self.user)
        self.assertIn("Invalid LLM_PROVIDER", str(ctx.exception))
