"""
Tests for vector_manager module
"""

import os
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from app.utils.vector_manager import (
    PGVectorManager,
    delete_all_vectors,
    delete_video_vectors,
    update_video_title_in_vectors,
)


class PGVectorManagerTests(TestCase):
    """Tests for PGVectorManager class"""

    def setUp(self):
        """Reset singleton state"""
        PGVectorManager._engine = None
        PGVectorManager._table_initialized = False

    def tearDown(self):
        """Clean up"""
        PGVectorManager._engine = None
        PGVectorManager._table_initialized = False

    @patch("app.utils.vector_manager.PGEngine.from_connection_string")
    @patch.dict(
        os.environ, {"DATABASE_URL": "postgresql://test:test@localhost:5432/test"}
    )
    def test_get_engine_creates_singleton(self, mock_from_conn):
        mock_engine = MagicMock()
        mock_from_conn.return_value = mock_engine

        engine1 = PGVectorManager.get_engine()
        engine2 = PGVectorManager.get_engine()

        self.assertIs(engine1, engine2)
        mock_from_conn.assert_called_once_with(
            url="postgresql+psycopg://test:test@localhost:5432/test"
        )

    @patch("app.utils.vector_manager.PGEngine.from_connection_string")
    @patch.dict(os.environ, {}, clear=True)
    def test_get_engine_default_url(self, mock_from_conn):
        mock_from_conn.return_value = MagicMock()

        PGVectorManager.get_engine()

        mock_from_conn.assert_called_once_with(
            url="postgresql+psycopg://postgres:postgres@postgres:5432/postgres"
        )

    @patch("app.utils.vector_manager.PGEngine.from_connection_string")
    @patch.dict(
        os.environ, {"DATABASE_URL": "postgres://test:test@localhost:5432/test"}
    )
    def test_get_engine_normalizes_postgres_short_url(self, mock_from_conn):
        mock_from_conn.return_value = MagicMock()

        PGVectorManager.get_engine()

        mock_from_conn.assert_called_once_with(
            url="postgresql+psycopg://test:test@localhost:5432/test"
        )

    @override_settings(PGVECTOR_COLLECTION_NAME="test_collection")
    def test_get_table_name(self):
        self.assertEqual(PGVectorManager.get_table_name(), "test_collection")

    @override_settings(EMBEDDING_VECTOR_SIZE=768)
    def test_get_vector_size(self):
        self.assertEqual(PGVectorManager.get_vector_size(), 768)

    @patch.object(PGVectorManager, "get_engine")
    def test_ensure_table_calls_init(self, mock_get_engine):
        mock_engine = MagicMock()
        mock_get_engine.return_value = mock_engine

        PGVectorManager.ensure_table()

        mock_engine.init_vectorstore_table.assert_called_once()

    @patch.object(PGVectorManager, "get_engine")
    def test_ensure_table_idempotent(self, mock_get_engine):
        mock_engine = MagicMock()
        mock_get_engine.return_value = mock_engine

        PGVectorManager.ensure_table()
        PGVectorManager.ensure_table()

        # Only called once due to _table_initialized flag
        mock_engine.init_vectorstore_table.assert_called_once()

    @patch.object(PGVectorManager, "get_engine")
    def test_ensure_table_handles_existing_table(self, mock_get_engine):
        mock_engine = MagicMock()
        mock_engine.init_vectorstore_table.side_effect = Exception(
            'relation "videoq_scenes" already exists'
        )
        mock_get_engine.return_value = mock_engine

        # Should not raise
        PGVectorManager.ensure_table()
        self.assertTrue(PGVectorManager._table_initialized)

    @patch.object(PGVectorManager, "get_engine")
    def test_ensure_table_raises_unexpected_errors(self, mock_get_engine):
        mock_engine = MagicMock()
        mock_engine.init_vectorstore_table.side_effect = ConnectionError(
            "connection refused"
        )
        mock_get_engine.return_value = mock_engine

        with self.assertRaises(ConnectionError):
            PGVectorManager.ensure_table()
        self.assertFalse(PGVectorManager._table_initialized)

    @patch("app.utils.vector_manager.PGVectorStore.create_sync")
    @patch.object(PGVectorManager, "ensure_table")
    @patch.object(PGVectorManager, "get_engine")
    def test_create_vectorstore(self, mock_get_engine, mock_ensure, mock_create_sync):
        mock_engine = MagicMock()
        mock_get_engine.return_value = mock_engine
        mock_store = MagicMock()
        mock_create_sync.return_value = mock_store

        embeddings = MagicMock()
        result = PGVectorManager.create_vectorstore(embeddings)

        self.assertIs(result, mock_store)
        mock_ensure.assert_called_once()
        mock_create_sync.assert_called_once_with(
            engine=mock_engine,
            embedding_service=embeddings,
            table_name=PGVectorManager.get_table_name(),
            metadata_columns=["user_id", "video_id"],
        )


class DeleteVideoVectorsTests(TestCase):
    """Tests for delete_video_vectors function"""

    @patch.object(PGVectorManager, "_get_management_store")
    def test_delete_video_vectors(self, mock_get_store):
        mock_store = MagicMock()
        mock_get_store.return_value = mock_store

        delete_video_vectors(123)

        mock_store.delete.assert_called_once_with(filter={"video_id": 123})

    @patch.object(PGVectorManager, "_get_management_store")
    @patch("app.utils.vector_manager.logger")
    def test_delete_video_vectors_error(self, mock_logger, mock_get_store):
        mock_get_store.side_effect = Exception("Database error")

        delete_video_vectors(123)

        mock_logger.warning.assert_called()


class UpdateVideoTitleTests(TestCase):
    """Tests for update_video_title_in_vectors function"""

    @patch("django.db.connection")
    def test_update_video_title_in_vectors(self, mock_connection):
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 3
        mock_connection.cursor.return_value.__enter__ = MagicMock(
            return_value=mock_cursor
        )
        mock_connection.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = update_video_title_in_vectors(123, "New Title")

        self.assertEqual(result, 3)
        mock_cursor.execute.assert_called_once()

    @patch("django.db.connection")
    def test_update_video_title_in_vectors_no_results(self, mock_connection):
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 0
        mock_connection.cursor.return_value.__enter__ = MagicMock(
            return_value=mock_cursor
        )
        mock_connection.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = update_video_title_in_vectors(123, "New Title")

        self.assertEqual(result, 0)


class DeleteAllVectorsTests(TestCase):
    """Tests for delete_all_vectors function"""

    @patch("django.db.connection")
    def test_delete_all_vectors(self, mock_connection):
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 100
        mock_connection.cursor.return_value.__enter__ = MagicMock(
            return_value=mock_cursor
        )
        mock_connection.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = delete_all_vectors()

        self.assertEqual(result, 100)
        mock_cursor.execute.assert_called_once()

    @patch("django.db.connection")
    def test_delete_all_vectors_error(self, mock_connection):
        mock_connection.cursor.return_value.__enter__ = MagicMock(
            side_effect=Exception("Database error")
        )
        mock_connection.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with self.assertRaises(Exception):
            delete_all_vectors()
