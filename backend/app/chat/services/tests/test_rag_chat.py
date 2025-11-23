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

    @override_settings(OPENAI_API_KEY="test-api-key")
    @patch("app.chat.services.rag_chat.PGVector.from_existing_index")
    @patch("app.chat.services.rag_chat.PGVectorManager")
    @patch("app.chat.services.rag_chat.OpenAIEmbeddings")
    def test_create_vector_store_with_api_key(
        self, mock_embeddings, mock_pgvector_manager, mock_pgvector
    ):
        """Test _create_vector_store when API key is configured"""
        mock_pgvector_manager.get_config.return_value = {
            "collection_name": "test_collection"
        }
        mock_pgvector_manager.get_psycopg_connection_string.return_value = (
            "postgresql://test"
        )

        service = RagChatService(user=self.user, llm=MagicMock())
        vector_store = service._create_vector_store()

        self.assertIsNotNone(vector_store)
        mock_embeddings.assert_called_once_with(
            model="text-embedding-3-small",
            api_key="test-api-key",
        )

    @override_settings(OPENAI_API_KEY=None)
    def test_create_vector_store_without_api_key(self):
        """Test _create_vector_store when API key is not configured"""
        service = RagChatService(user=self.user, llm=MagicMock())

        with self.assertRaises(ValueError) as context:
            service._create_vector_store()

        self.assertIn("OpenAI API key is not configured", str(context.exception))

    @override_settings(OPENAI_API_KEY="")
    def test_create_vector_store_with_empty_api_key(self):
        """Test _create_vector_store when API key is empty string"""
        service = RagChatService(user=self.user, llm=MagicMock())

        with self.assertRaises(ValueError) as context:
            service._create_vector_store()

        self.assertIn("OpenAI API key is not configured", str(context.exception))
