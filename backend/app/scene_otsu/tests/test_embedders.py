"""
Tests for scene_otsu embedder classes
"""

from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings


class BaseEmbedderTests(TestCase):
    """Tests for BaseEmbedder class"""

    @patch("app.scene_otsu.embedders.OpenAIEmbeddings")
    @patch("app.scene_otsu.embedders.tiktoken.encoding_for_model")
    def test_count_tokens(self, mock_tiktoken, mock_openai_embeddings):
        """Test token counting"""
        from app.scene_otsu.embedders import OpenAIEmbedder

        mock_encoding = MagicMock()
        mock_encoding.encode.return_value = [1, 2, 3, 4, 5]
        mock_tiktoken.return_value = mock_encoding

        embedder = OpenAIEmbedder(api_key="test-key")

        count = embedder.count_tokens("Hello world")

        self.assertEqual(count, 5)
        mock_encoding.encode.assert_called_once_with("Hello world")

    @patch("app.scene_otsu.embedders.OpenAIEmbeddings")
    @patch("app.scene_otsu.embedders.tiktoken.encoding_for_model")
    def test_get_embeddings_batches(self, mock_tiktoken, mock_openai_embeddings):
        """Test that get_embeddings processes in batches"""
        from app.scene_otsu.embedders import OpenAIEmbedder

        mock_encoding = MagicMock()
        mock_tiktoken.return_value = mock_encoding

        mock_embeddings_instance = MagicMock()
        mock_embeddings_instance.embed_documents.return_value = [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
        ]
        mock_openai_embeddings.return_value = mock_embeddings_instance

        embedder = OpenAIEmbedder(api_key="test-key", batch_size=2)

        texts = ["Text 1", "Text 2", "Text 3", "Text 4"]

        with patch.object(embedder, "_embed_batch") as mock_embed_batch:
            mock_embed_batch.return_value = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

            embedder.get_embeddings(texts)

            # Should be called twice for 4 texts with batch_size=2
            self.assertEqual(mock_embed_batch.call_count, 2)


class OpenAIEmbedderTests(TestCase):
    """Tests for OpenAIEmbedder class"""

    @patch("app.scene_otsu.embedders.OpenAIEmbeddings")
    @patch("app.scene_otsu.embedders.tiktoken.encoding_for_model")
    def test_initialization(self, mock_tiktoken, mock_openai_embeddings):
        """Test OpenAIEmbedder initialization"""
        from app.scene_otsu.embedders import OpenAIEmbedder

        embedder = OpenAIEmbedder(
            api_key="test-api-key",
            model="text-embedding-3-small",
            batch_size=16,
        )

        self.assertEqual(embedder.model, "text-embedding-3-small")
        self.assertEqual(embedder.batch_size, 16)
        mock_openai_embeddings.assert_called_once()

    @patch("app.scene_otsu.embedders.OpenAIEmbeddings")
    @patch("app.scene_otsu.embedders.tiktoken.encoding_for_model")
    def test_uses_correct_model_for_tiktoken(
        self, mock_tiktoken, mock_openai_embeddings
    ):
        """Test that correct model is used for tiktoken"""
        from app.scene_otsu.embedders import OpenAIEmbedder

        OpenAIEmbedder(api_key="test-key", model="text-embedding-ada-002")

        mock_tiktoken.assert_called_once_with("text-embedding-ada-002")


class OllamaEmbedderTests(TestCase):
    """Tests for OllamaEmbedder class"""

    @patch("app.scene_otsu.embedders.OllamaEmbeddings")
    @patch("app.scene_otsu.embedders.tiktoken.get_encoding")
    def test_initialization(self, mock_tiktoken, mock_ollama_embeddings):
        """Test OllamaEmbedder initialization"""
        from app.scene_otsu.embedders import OllamaEmbedder

        embedder = OllamaEmbedder(
            model="qwen3-embedding:0.6b",
            base_url="http://localhost:11434",
            batch_size=8,
        )

        self.assertEqual(embedder.model, "qwen3-embedding:0.6b")
        self.assertEqual(embedder.base_url, "http://localhost:11434")
        self.assertEqual(embedder.batch_size, 8)

    @patch("app.scene_otsu.embedders.OllamaEmbeddings")
    @patch("app.scene_otsu.embedders.tiktoken.get_encoding")
    def test_uses_cl100k_base_encoding(self, mock_tiktoken, mock_ollama_embeddings):
        """Test that cl100k_base encoding is used for Ollama"""
        from app.scene_otsu.embedders import OllamaEmbedder

        OllamaEmbedder()

        mock_tiktoken.assert_called_once_with("cl100k_base")


@override_settings(
    EMBEDDING_PROVIDER="openai", EMBEDDING_MODEL="text-embedding-3-small"
)
class CreateEmbedderOpenAITests(TestCase):
    """Tests for create_embedder function with OpenAI"""

    @patch("app.scene_otsu.embedders.OpenAIEmbedder")
    def test_creates_openai_embedder(self, mock_openai_embedder):
        """Test that OpenAI embedder is created"""
        from app.scene_otsu.embedders import create_embedder

        create_embedder(api_key="test-key")

        mock_openai_embedder.assert_called_once_with(
            api_key="test-key",
            model="text-embedding-3-small",
            batch_size=16,
        )

    def test_raises_without_api_key(self):
        """Test that ValueError is raised without API key"""
        from app.scene_otsu.embedders import create_embedder

        with self.assertRaises(ValueError) as context:
            create_embedder(api_key=None)

        self.assertIn("OpenAI API key is required", str(context.exception))


@override_settings(
    EMBEDDING_PROVIDER="ollama",
    EMBEDDING_MODEL="qwen3-embedding:0.6b",
    OLLAMA_BASE_URL="http://localhost:11434",
)
class CreateEmbedderOllamaTests(TestCase):
    """Tests for create_embedder function with Ollama"""

    @patch("app.scene_otsu.embedders.OllamaEmbedder")
    def test_creates_ollama_embedder(self, mock_ollama_embedder):
        """Test that Ollama embedder is created"""
        from app.scene_otsu.embedders import create_embedder

        create_embedder()

        mock_ollama_embedder.assert_called_once_with(
            model="qwen3-embedding:0.6b",
            base_url="http://localhost:11434",
            batch_size=16,
        )

    @patch("app.scene_otsu.embedders.OllamaEmbedder")
    def test_does_not_require_api_key(self, mock_ollama_embedder):
        """Test that API key is not required for Ollama"""
        from app.scene_otsu.embedders import create_embedder

        # Should not raise
        create_embedder(api_key=None)


@override_settings(EMBEDDING_PROVIDER="invalid")
class CreateEmbedderInvalidTests(TestCase):
    """Tests for create_embedder function with invalid provider"""

    def test_raises_for_invalid_provider(self):
        """Test that ValueError is raised for invalid provider"""
        from app.scene_otsu.embedders import create_embedder

        with self.assertRaises(ValueError) as context:
            create_embedder(api_key="test-key")

        self.assertIn("Invalid EMBEDDING_PROVIDER", str(context.exception))
