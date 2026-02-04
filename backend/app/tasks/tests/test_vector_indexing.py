"""
Tests for vector indexing functions
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.models import Video
from app.tasks.vector_indexing import (create_scene_metadata,
                                       index_scenes_batch,
                                       index_scenes_to_vectorstore)

User = get_user_model()


class CreateSceneMetadataTests(TestCase):
    """Tests for create_scene_metadata function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="completed",
        )

    def test_creates_basic_metadata(self):
        """Test that basic metadata is created correctly"""
        scene = {
            "start_time": "00:00:00,000",
            "end_time": "00:00:05,000",
            "start_sec": 0.0,
            "end_sec": 5.0,
            "index": 1,
        }

        result = create_scene_metadata(self.video, scene)

        self.assertEqual(result["video_id"], self.video.id)
        self.assertEqual(result["user_id"], self.user.id)
        self.assertEqual(result["video_title"], "Test Video")
        self.assertEqual(result["start_time"], "00:00:00,000")
        self.assertEqual(result["end_time"], "00:00:05,000")
        self.assertEqual(result["start_sec"], 0.0)
        self.assertEqual(result["end_sec"], 5.0)
        self.assertEqual(result["scene_index"], 1)

    def test_includes_external_id_when_present(self):
        """Test that external_id is included when present"""
        self.video.external_id = "ext-123"
        self.video.save()

        scene = {
            "start_time": "00:00:00,000",
            "end_time": "00:00:05,000",
            "start_sec": 0.0,
            "end_sec": 5.0,
            "index": 1,
        }

        result = create_scene_metadata(self.video, scene)

        self.assertEqual(result["external_id"], "ext-123")

    def test_excludes_external_id_when_not_present(self):
        """Test that external_id is not included when not present"""
        scene = {
            "start_time": "00:00:00,000",
            "end_time": "00:00:05,000",
            "start_sec": 0.0,
            "end_sec": 5.0,
            "index": 1,
        }

        result = create_scene_metadata(self.video, scene)

        self.assertNotIn("external_id", result)


class IndexScenesToVectorstoreTests(TestCase):
    """Tests for index_scenes_to_vectorstore function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="completed",
        )

    @patch("app.tasks.vector_indexing.PGVector")
    @patch("app.tasks.vector_indexing.PGVectorManager")
    @patch("app.tasks.vector_indexing.get_embeddings")
    def test_indexes_scenes_successfully(
        self, mock_get_embeddings, mock_pgvector_manager, mock_pgvector
    ):
        """Test successful scene indexing"""
        mock_pgvector_manager.get_config.return_value = {
            "collection_name": "test_collection",
            "database_url": "postgresql://localhost/test",
        }

        scene_docs = [
            {"text": "Hello world", "metadata": {"video_id": 1}},
            {"text": "Test content", "metadata": {"video_id": 1}},
        ]

        index_scenes_to_vectorstore(scene_docs, self.video, "test-api-key")

        mock_pgvector.from_texts.assert_called_once()

    @patch("app.tasks.vector_indexing.PGVectorManager")
    @patch("app.tasks.vector_indexing.get_embeddings")
    def test_skips_empty_texts(self, mock_get_embeddings, mock_pgvector_manager):
        """Test that empty texts are skipped"""
        mock_pgvector_manager.get_config.return_value = {
            "collection_name": "test_collection",
            "database_url": "postgresql://localhost/test",
        }

        scene_docs = [
            {"text": "", "metadata": {"video_id": 1}},
            {"text": None, "metadata": {"video_id": 1}},
        ]

        # Should not raise, should just log and skip
        index_scenes_to_vectorstore(scene_docs, self.video, "test-api-key")

    @patch("app.tasks.vector_indexing.PGVector")
    @patch("app.tasks.vector_indexing.PGVectorManager")
    @patch("app.tasks.vector_indexing.get_embeddings")
    def test_handles_indexing_error(
        self, mock_get_embeddings, mock_pgvector_manager, mock_pgvector
    ):
        """Test that indexing errors are handled gracefully"""
        mock_pgvector_manager.get_config.return_value = {
            "collection_name": "test_collection",
            "database_url": "postgresql://localhost/test",
        }
        mock_pgvector.from_texts.side_effect = Exception("Indexing failed")

        scene_docs = [{"text": "Hello world", "metadata": {"video_id": 1}}]

        # Should not raise, should log warning
        index_scenes_to_vectorstore(scene_docs, self.video, "test-api-key")

    @patch("app.tasks.vector_indexing.PGVector")
    @patch("app.tasks.vector_indexing.PGVectorManager")
    @patch("app.tasks.vector_indexing.get_embeddings")
    def test_converts_connection_string(
        self, mock_get_embeddings, mock_pgvector_manager, mock_pgvector
    ):
        """Test that postgresql:// is converted to postgresql+psycopg://"""
        mock_pgvector_manager.get_config.return_value = {
            "collection_name": "test_collection",
            "database_url": "postgresql://user:pass@localhost/db",
        }

        scene_docs = [{"text": "Hello world", "metadata": {"video_id": 1}}]

        index_scenes_to_vectorstore(scene_docs, self.video, "test-api-key")

        # Check that the connection string was converted
        call_kwargs = mock_pgvector.from_texts.call_args[1]
        self.assertIn("postgresql+psycopg://", call_kwargs["connection"])


class IndexScenesBatchTests(TestCase):
    """Tests for index_scenes_batch function"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="completed",
        )

    @patch("app.tasks.vector_indexing.index_scenes_to_vectorstore")
    @patch("app.tasks.vector_indexing.parse_srt_scenes")
    def test_parses_srt_and_indexes(self, mock_parse, mock_index):
        """Test that SRT is parsed and indexed"""
        mock_parse.return_value = [
            {
                "text": "Hello world",
                "start_time": "00:00:00,000",
                "end_time": "00:00:05,000",
                "start_sec": 0.0,
                "end_sec": 5.0,
                "index": 1,
            }
        ]

        srt_content = "1\n00:00:00,000 --> 00:00:05,000\nHello world\n"

        index_scenes_batch(srt_content, self.video, "test-api-key")

        mock_parse.assert_called_once_with(srt_content)
        mock_index.assert_called_once()

    @patch("app.tasks.vector_indexing.index_scenes_to_vectorstore")
    @patch("app.tasks.vector_indexing.parse_srt_scenes")
    def test_creates_correct_scene_docs(self, mock_parse, mock_index):
        """Test that scene documents are created correctly"""
        mock_parse.return_value = [
            {
                "text": "Scene 1",
                "start_time": "00:00:00,000",
                "end_time": "00:00:05,000",
                "start_sec": 0.0,
                "end_sec": 5.0,
                "index": 1,
            },
            {
                "text": "Scene 2",
                "start_time": "00:00:05,000",
                "end_time": "00:00:10,000",
                "start_sec": 5.0,
                "end_sec": 10.0,
                "index": 2,
            },
        ]

        srt_content = "mock srt content"

        index_scenes_batch(srt_content, self.video, "test-api-key")

        # Verify scene docs structure
        call_args = mock_index.call_args[0]
        scene_docs = call_args[0]

        self.assertEqual(len(scene_docs), 2)
        self.assertEqual(scene_docs[0]["text"], "Scene 1")
        self.assertEqual(scene_docs[1]["text"], "Scene 2")
        self.assertIn("metadata", scene_docs[0])
        self.assertEqual(scene_docs[0]["metadata"]["video_id"], self.video.id)

    @patch("app.tasks.vector_indexing.parse_srt_scenes")
    def test_raises_on_parsing_error(self, mock_parse):
        """Test that parsing errors are re-raised"""
        mock_parse.side_effect = Exception("Parse failed")

        srt_content = "invalid srt"

        with self.assertRaises(Exception):
            index_scenes_batch(srt_content, self.video, "test-api-key")
