"""
Tests for rag_chat module
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from app.chat.services.rag_chat import RagChatService
from app.models import Video, VideoGroup

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

    @patch("app.chat.services.rag_chat.PGVectorManager.create_vectorstore")
    @patch("app.chat.services.rag_chat.get_embeddings")
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

    @patch("app.chat.services.rag_chat.PGVectorManager.create_vectorstore")
    @patch("app.chat.services.rag_chat.get_embeddings")
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
