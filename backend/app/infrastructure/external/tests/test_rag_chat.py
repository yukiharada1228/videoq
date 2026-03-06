"""
Tests for rag_chat module
"""

import unittest
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app.domain.chat.dtos import ChatMessageDTO
from app.domain.chat.gateways import LLMConfigurationError, LLMProviderError
from app.infrastructure.external.rag_gateway import RagChatGateway
from app.infrastructure.external.rag_service import RagChatService


def _make_user(user_id=1):
    user = MagicMock()
    user.id = user_id
    user.pk = user_id
    return user


class RagChatServiceTests(SimpleTestCase):
    """Tests for RagChatService class — no DB needed."""

    def setUp(self):
        self.user = _make_user()

    @patch("app.infrastructure.external.rag_service.PGVectorManager.create_vectorstore")
    @patch("app.infrastructure.external.rag_service.get_embeddings")
    @override_settings(EMBEDDING_PROVIDER="openai", OPENAI_API_KEY="test-api-key")
    def test_create_vector_store_with_api_key(
        self, mock_get_embeddings, mock_create_vectorstore
    ):
        """Test _create_vector_store when API key is configured via environment"""
        mock_store = MagicMock()
        mock_create_vectorstore.return_value = mock_store

        service = RagChatService(user=self.user, llm=MagicMock())
        vector_store = service._create_vector_store()

        self.assertIsNotNone(vector_store)
        mock_get_embeddings.assert_called_once_with("test-api-key")
        mock_create_vectorstore.assert_called_once()

    @patch("app.infrastructure.external.rag_service.PGVectorManager.create_vectorstore")
    @patch("app.infrastructure.external.rag_service.get_embeddings")
    @override_settings(
        EMBEDDING_PROVIDER="ollama",
        EMBEDDING_MODEL="qwen3-embedding:0.6b",
        OPENAI_API_KEY="",
    )
    def test_create_vector_store_with_ollama(
        self, mock_get_embeddings, mock_create_vectorstore
    ):
        """Test _create_vector_store when using Ollama (no API key needed)"""
        mock_store = MagicMock()
        mock_create_vectorstore.return_value = mock_store

        service = RagChatService(user=self.user, llm=MagicMock())
        vector_store = service._create_vector_store()

        self.assertIsNotNone(vector_store)
        mock_get_embeddings.assert_called_once_with(None)
        mock_create_vectorstore.assert_called_once()


class RagChatGatewayExceptionTests(SimpleTestCase):
    """Verify RagChatGateway exception classification — mock User.objects.get."""

    @patch("app.infrastructure.external.rag_gateway.get_user_model")
    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_service_run_exception_becomes_llm_provider_error(
        self, mock_service_cls, mock_get_llm, mock_get_user_model
    ):
        """Exceptions from RagChatService.run() must be wrapped as LLMProviderError."""
        mock_user_model = MagicMock()
        mock_user_model.objects.get.return_value = _make_user()
        mock_get_user_model.return_value = mock_user_model

        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()
        mock_service.run.side_effect = RuntimeError("API call failed")
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        with self.assertRaises(LLMProviderError):
            gateway.generate_reply(messages=messages, user_id=1)

    @patch("app.infrastructure.external.rag_gateway.get_user_model")
    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai", OPENAI_API_KEY="test-key")
    def test_service_run_exception_preserves_cause(
        self, mock_service_cls, mock_get_llm, mock_get_user_model
    ):
        """LLMProviderError must chain the original exception via __cause__."""
        mock_user_model = MagicMock()
        mock_user_model.objects.get.return_value = _make_user()
        mock_get_user_model.return_value = mock_user_model

        original = RuntimeError("upstream error")
        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()
        mock_service.run.side_effect = original
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        try:
            gateway.generate_reply(messages=messages, user_id=1)
        except LLMProviderError as exc:
            self.assertIs(exc.__cause__, original)

    @patch("app.infrastructure.external.rag_gateway.get_user_model")
    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    def test_user_does_not_exist_propagates_naturally(
        self, mock_get_llm, mock_get_user_model
    ):
        """DoesNotExist from User.objects.get must NOT be converted to LLMProviderError."""
        mock_user_model = MagicMock()
        mock_user_model.DoesNotExist = Exception
        mock_user_model.objects.get.side_effect = mock_user_model.DoesNotExist("not found")
        mock_get_user_model.return_value = mock_user_model

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        with self.assertRaises(Exception):
            gateway.generate_reply(messages=messages, user_id=999999)
