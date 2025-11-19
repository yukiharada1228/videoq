"""
Tests for llm module
"""

from unittest.mock import patch

from app.chat.services.llm import get_langchain_llm, handle_langchain_exception
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status

User = get_user_model()


class GetLangchainLLMTests(TestCase):
    """Tests for get_langchain_llm function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    @override_settings(OPENAI_API_KEY="test-api-key")
    @patch("app.chat.services.llm.ChatOpenAI")
    def test_get_langchain_llm_with_api_key(self, mock_chat_openai):
        """Test get_langchain_llm when API key is configured"""
        llm, error_response = get_langchain_llm(self.user)

        self.assertIsNotNone(llm)
        self.assertIsNone(error_response)
        mock_chat_openai.assert_called_once_with(
            model="gpt-4o-mini",
            api_key="test-api-key",
            temperature=0.7,
        )

    @override_settings(OPENAI_API_KEY=None)
    def test_get_langchain_llm_without_api_key(self):
        """Test get_langchain_llm when API key is not configured"""
        llm, error_response = get_langchain_llm(self.user)

        self.assertIsNone(llm)
        self.assertIsNotNone(error_response)
        self.assertEqual(error_response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("OpenAI API key is not configured", str(error_response.data))

    @override_settings(OPENAI_API_KEY="")
    def test_get_langchain_llm_with_empty_api_key(self):
        """Test get_langchain_llm when API key is empty string"""
        llm, error_response = get_langchain_llm(self.user)

        self.assertIsNone(llm)
        self.assertIsNotNone(error_response)
        self.assertEqual(error_response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("OpenAI API key is not configured", str(error_response.data))


class HandleLangchainExceptionTests(TestCase):
    """Tests for handle_langchain_exception function"""

    def test_handle_langchain_exception_invalid_api_key(self):
        """Test handle_langchain_exception with invalid API key error"""
        exception = Exception("invalid_api_key: The API key provided is invalid")
        response = handle_langchain_exception(exception)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Invalid API key", str(response.data))

    def test_handle_langchain_exception_authentication_error(self):
        """Test handle_langchain_exception with authentication error"""
        exception = Exception("Authentication failed")
        response = handle_langchain_exception(exception)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn("Invalid API key", str(response.data))

    def test_handle_langchain_exception_rate_limit(self):
        """Test handle_langchain_exception with rate limit error"""
        exception = Exception("rate_limit: Too many requests")
        response = handle_langchain_exception(exception)

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("API rate limit reached", str(response.data))

    def test_handle_langchain_exception_generic_error(self):
        """Test handle_langchain_exception with generic error"""
        exception = Exception("Something went wrong")
        response = handle_langchain_exception(exception)

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("OpenAI API error", str(response.data))

