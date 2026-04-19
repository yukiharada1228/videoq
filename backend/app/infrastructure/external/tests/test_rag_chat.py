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
    @override_settings(EMBEDDING_PROVIDER="openai", OPENAI_API_KEY="test-server-key")
    def test_create_vector_store_with_openai(
        self, mock_get_embeddings, mock_create_vectorstore
    ):
        """Test _create_vector_store uses server OPENAI_API_KEY"""
        mock_store = MagicMock()
        mock_create_vectorstore.return_value = mock_store

        service = RagChatService(user=self.user, llm=MagicMock())
        vector_store = service._create_vector_store()

        self.assertIsNotNone(vector_store)
        mock_get_embeddings.assert_called_once_with()
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
        mock_get_embeddings.assert_called_once_with()
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


class RagChatGatewayStreamingTests(TestCase):
    """Tests for RagChatGateway.stream_reply()."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="stream_testuser",
            email="stream_test@example.com",
            password="testpass123",
        )

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai")
    def test_stream_reply_yields_content_chunks(self, mock_service_cls, mock_get_llm):
        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()

        def _fake_stream(**kwargs):
            yield "Hello "
            yield "World"
            from app.infrastructure.external.rag_service import _RagServiceStreamEnd
            yield _RagServiceStreamEnd(citations=None, query_text="test")

        mock_service.stream.side_effect = _fake_stream
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        chunks = list(gateway.stream_reply(messages=messages, user_id=self.user.id))

        content_chunks = [c for c in chunks if c.text is not None]
        self.assertEqual("".join(chunk.text for chunk in content_chunks), "Hello World")
        self.assertEqual(content_chunks[0].text, "H")
        self.assertEqual(content_chunks[-1].text, "d")

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai")
    def test_stream_reply_splits_batched_service_chunks_into_single_units(self, mock_service_cls, mock_get_llm):
        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()

        def _fake_stream(**kwargs):
            yield "AB"
            from app.infrastructure.external.rag_service import _RagServiceStreamEnd
            yield _RagServiceStreamEnd(citations=None, query_text="test")

        mock_service.stream.side_effect = _fake_stream
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        chunks = list(gateway.stream_reply(messages=messages, user_id=self.user.id))

        content_chunks = [c.text for c in chunks if c.text is not None]
        self.assertEqual(content_chunks, ["A", "B"])

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai")
    def test_stream_reply_yields_final_chunk(self, mock_service_cls, mock_get_llm):
        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()

        def _fake_stream(**kwargs):
            yield "Hello"
            from app.infrastructure.external.rag_service import _RagServiceStreamEnd
            yield _RagServiceStreamEnd(citations=None, query_text="q")

        mock_service.stream.side_effect = _fake_stream
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        chunks = list(gateway.stream_reply(messages=messages, user_id=self.user.id))

        final_chunks = [c for c in chunks if c.is_final]
        self.assertEqual(len(final_chunks), 1)
        self.assertEqual(final_chunks[0].query_text, "q")

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @override_settings(LLM_PROVIDER="openai")
    def test_stream_reply_wraps_runtime_errors_as_llm_provider_error(self, mock_service_cls, mock_get_llm):
        from app.domain.chat.gateways import LLMProviderError

        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()

        def _fake_stream(**kwargs):
            yield "partial"
            raise RuntimeError("LLM failed mid-stream")

        mock_service.stream.side_effect = _fake_stream
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        with self.assertRaises(LLMProviderError):
            list(gateway.stream_reply(messages=messages, user_id=self.user.id))

    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    def test_stream_reply_raises_rag_user_not_found_for_missing_user(self, mock_get_llm):
        from app.domain.chat.gateways import RagUserNotFoundError

        gateway = RagChatGateway()
        messages = [ChatMessageDTO(role="user", content="hello")]

        with self.assertRaises(RagUserNotFoundError):
            list(gateway.stream_reply(messages=messages, user_id=999999))


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
