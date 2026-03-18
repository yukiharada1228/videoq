"""
Tests for rag_chat module
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from app.domain.chat.dtos import ChatMessageDTO
from app.domain.chat.gateways import (
    LLMProviderError,
    RagUserNotFoundError,
)
from app.infrastructure.external.rag_gateway import RagChatGateway
from app.infrastructure.external.rag_service import RagChatService
from app.infrastructure.models import Video, VideoGroup

User = get_user_model()


class RagChatServiceTests(TestCase):
    """Tests for RagChatService class"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            description="Test Description",
            status="completed",
            transcript="Test transcript",
        )
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
        )

    @patch("app.infrastructure.external.rag_service.PGVectorManager.create_vectorstore")
    @patch("app.infrastructure.external.rag_service.get_embeddings")
    @override_settings(EMBEDDING_PROVIDER="openai")
    def test_create_vector_store_with_api_key(
        self, mock_get_embeddings, mock_create_vectorstore
    ):
        """Test _create_vector_store when API key is provided via constructor"""
        mock_store = MagicMock()
        mock_create_vectorstore.return_value = mock_store

        service = RagChatService(user=self.user, llm=MagicMock(), api_key="test-api-key")
        vector_store = service._create_vector_store()

        self.assertIsNotNone(vector_store)
        mock_get_embeddings.assert_called_once_with("test-api-key")
        mock_create_vectorstore.assert_called_once()

    @patch("app.infrastructure.external.rag_service.PGVectorManager.create_vectorstore")
    @patch("app.infrastructure.external.rag_service.get_embeddings")
    @override_settings(
        EMBEDDING_PROVIDER="ollama",
        EMBEDDING_MODEL="qwen3-embedding:0.6b",
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


class RagChatGatewayExceptionTests(TestCase):
    """Verify RagChatGateway exception classification."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="gw_testuser",
            email="gw_test@example.com",
            password="testpass123",
        )

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai")
    def test_service_run_exception_becomes_llm_provider_error(
        self, mock_service_cls, mock_get_llm
    ):
        """Exceptions from RagChatService.run() must be wrapped as LLMProviderError."""
        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()
        mock_service.run.side_effect = RuntimeError("API call failed")
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        with self.assertRaises(LLMProviderError):
            gateway.generate_reply(messages=messages, user_id=self.user.id)

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai")
    def test_service_run_exception_preserves_cause(
        self, mock_service_cls, mock_get_llm
    ):
        """LLMProviderError must chain the original exception via __cause__."""
        original = RuntimeError("upstream error")
        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()
        mock_service.run.side_effect = original
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        try:
            gateway.generate_reply(messages=messages, user_id=self.user.id)
        except LLMProviderError as exc:
            self.assertIs(exc.__cause__, original)

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    def test_user_does_not_exist_propagates_naturally(self, mock_get_llm):
        """Missing user must be normalized to domain gateway error."""
        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        with self.assertRaises(RagUserNotFoundError):
            gateway.generate_reply(messages=messages, user_id=999999)
