"""
Tests for llm module
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from pydantic import SecretStr

from app.chat.services.llm import (ChatServiceError, get_langchain_llm,
                                   handle_langchain_exception)

User = get_user_model()


class GetLangchainLLMTests(TestCase):
    """Tests for get_langchain_llm function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    @patch("app.chat.services.llm.ChatOpenAI")
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

    @patch("app.chat.services.llm.ChatOpenAI")
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
        """Test get_langchain_llm when API key is not configured"""
        with self.assertRaises(ChatServiceError) as ctx:
            get_langchain_llm(self.user)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("OPENAI_API_KEY", ctx.exception.message)

    @override_settings(
        LLM_PROVIDER="openai", OPENAI_API_KEY=None, LLM_MODEL="gpt-4o-mini"
    )
    @patch.dict("os.environ", {"OPENAI_API_KEY": ""}, clear=False)
    def test_get_langchain_llm_with_none_api_key(self):
        """Test get_langchain_llm when API key is None"""
        with self.assertRaises(ChatServiceError) as ctx:
            get_langchain_llm(self.user)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("OPENAI_API_KEY", ctx.exception.message)

    @patch("app.chat.services.llm.ChatOllama")
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


class HandleLangchainExceptionTests(TestCase):
    """Tests for handle_langchain_exception function"""

    def test_handle_langchain_exception_invalid_api_key(self):
        """Test handle_langchain_exception with invalid API key error"""
        exception = Exception("invalid_api_key: The API key provided is invalid")
        response = handle_langchain_exception(exception)

        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid API key", response.message)

    def test_handle_langchain_exception_authentication_error(self):
        """Test handle_langchain_exception with authentication error"""
        exception = Exception("Authentication failed")
        response = handle_langchain_exception(exception)

        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid API key", response.message)

    def test_handle_langchain_exception_rate_limit(self):
        """Test handle_langchain_exception with rate limit error"""
        exception = Exception("rate_limit: Too many requests")
        response = handle_langchain_exception(exception)

        self.assertEqual(response.status_code, 429)
        self.assertIn("API rate limit reached", response.message)

    def test_handle_langchain_exception_generic_error(self):
        """Test handle_langchain_exception with generic error"""
        exception = Exception("Something went wrong")
        response = handle_langchain_exception(exception)

        self.assertEqual(response.status_code, 500)
        self.assertIn("OpenAI API error", response.message)
