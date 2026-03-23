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

    def test_build_reference_entries_adds_bracketed_indices(self):
        service = RagChatService(user=self.user, llm=MagicMock())
        docs = [
            MagicMock(
                metadata={
                    "video_title": "Video A",
                    "start_time": "00:00:10",
                    "end_time": "00:00:20",
                },
                page_content="First scene",
            ),
            MagicMock(
                metadata={
                    "video_title": "Video B",
                    "start_time": "00:01:00",
                    "end_time": "00:01:10",
                },
                page_content="Second scene",
            ),
        ]

        entries = service._build_reference_entries(docs)

        self.assertEqual(entries[0], "[1] Video A 00:00:10 - 00:00:20\nFirst scene")
        self.assertEqual(entries[1], "[2] Video B 00:01:00 - 00:01:10\nSecond scene")


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

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai")
    def test_generate_reply_repairs_dangling_multi_id_ref_markup(
        self, mock_service_cls, mock_get_llm
    ):
        from langchain_core.messages import AIMessage

        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()
        mock_service.run.return_value = type(
            "RagResultStub",
            (),
            {
                "llm_response": AIMessage(content='Summary.<ref ids="1,2,3">continued'),
                "query_text": "hello",
                "citations": [],
            },
        )()
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        result = gateway.generate_reply(messages=messages, user_id=self.user.id)

        self.assertEqual(result.content, 'Summary.<ref ids="1,2,3"> </ref>continued')

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai")
    def test_generate_reply_removes_bare_ref_tag(
        self, mock_service_cls, mock_get_llm
    ):
        from langchain_core.messages import AIMessage

        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()
        mock_service.run.return_value = type(
            "RagResultStub",
            (),
            {
                "llm_response": AIMessage(content='Summary.<ref ids="1,2"> </ref>.<ref>continued'),
                "query_text": "hello",
                "citations": [],
            },
        )()
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        result = gateway.generate_reply(messages=messages, user_id=self.user.id)

        self.assertEqual(result.content, 'Summary.<ref ids="1,2"> </ref>.continued')
