"""
Tests for vector_manager module
"""

import os
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings

from app.infrastructure.external.vector_store import (
    PGVectorManager,
    _ALLOWED_TABLE_NAMES,
    _get_safe_table_identifier,
    delete_all_vectors,
    delete_video_vectors,
    update_video_title_in_vectors,
)


class PGVectorManagerTests(SimpleTestCase):
    """Tests for PGVectorManager class"""

    def setUp(self):
        """Reset singleton state"""
        PGVectorManager._engine = None
        PGVectorManager._table_initialized = False

    def tearDown(self):
        """Clean up"""
        PGVectorManager._engine = None
        PGVectorManager._table_initialized = False

    @patch("app.infrastructure.external.vector_store.PGEngine.from_connection_string")
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

    @patch("app.infrastructure.external.vector_store.PGEngine.from_connection_string")
    @patch.dict(os.environ, {}, clear=True)
    def test_get_engine_default_url(self, mock_from_conn):
        mock_from_conn.return_value = MagicMock()

        PGVectorManager.get_engine()

        mock_from_conn.assert_called_once_with(
            url="postgresql+psycopg://postgres:postgres@postgres:5432/postgres"
        )

    @patch("app.infrastructure.external.vector_store.PGEngine.from_connection_string")
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

    @patch("app.infrastructure.external.vector_store.PGVectorStore.create_sync")
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


class SafeTableIdentifierTests(SimpleTestCase):
    """Tests for _get_safe_table_identifier function (SQL injection prevention)"""

    @override_settings(PGVECTOR_COLLECTION_NAME="videoq_scenes")
    @patch("django.db.connection")
    def test_allowed_table_name_returns_quoted_identifier(self, mock_connection):
        mock_connection.ops.quote_name.return_value = '"videoq_scenes"'

        result = _get_safe_table_identifier()

        mock_connection.ops.quote_name.assert_called_once_with("videoq_scenes")
        self.assertEqual(result, '"videoq_scenes"')

    @override_settings(PGVECTOR_COLLECTION_NAME="malicious_table; DROP TABLE users; --")
    def test_disallowed_table_name_raises_value_error(self):
        with self.assertRaises(ValueError):
            _get_safe_table_identifier()

    @override_settings(PGVECTOR_COLLECTION_NAME="unknown_table")
    def test_unknown_table_name_raises_value_error(self):
        with self.assertRaises(ValueError):
            _get_safe_table_identifier()

    def test_allowed_table_names_is_frozenset(self):
        self.assertIsInstance(_ALLOWED_TABLE_NAMES, frozenset)

    def test_allowed_table_names_contains_default(self):
        self.assertIn("videoq_scenes", _ALLOWED_TABLE_NAMES)

    @override_settings(PGVECTOR_COLLECTION_NAME="videoq_scenes")
    @patch("django.db.connection")
    def test_update_video_title_uses_safe_table_identifier(self, mock_connection):
        """Verify update_video_title_in_vectors does not use .format() with user input"""
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 1
        mock_connection.cursor.return_value.__enter__ = MagicMock(
            return_value=mock_cursor
        )
        mock_connection.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_connection.ops.quote_name.return_value = '"videoq_scenes"'

        result = update_video_title_in_vectors(1, "Title")

        self.assertEqual(result, 1)
        # The table name must come from quote_name (validated path), not raw user input
        mock_connection.ops.quote_name.assert_called_once_with("videoq_scenes")
        call_args = mock_cursor.execute.call_args
        sql = call_args[0][0]
        # Parameterized args must be passed separately (not embedded in SQL)
        params = call_args[0][1]
        self.assertIn("Title", params)
        self.assertNotIn("Title", sql)

    @override_settings(PGVECTOR_COLLECTION_NAME="videoq_scenes")
    @patch("django.db.connection")
    def test_delete_all_vectors_uses_safe_table_identifier(self, mock_connection):
        """Verify delete_all_vectors does not use .format() with unvalidated input"""
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 5
        mock_connection.cursor.return_value.__enter__ = MagicMock(
            return_value=mock_cursor
        )
        mock_connection.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_connection.ops.quote_name.return_value = '"videoq_scenes"'

        result = delete_all_vectors()

        self.assertEqual(result, 5)
        # The table name must come through the validated quote_name path
        mock_connection.ops.quote_name.assert_called_once_with("videoq_scenes")

    @override_settings(PGVECTOR_COLLECTION_NAME="videoq_scenes")
    @patch("app.infrastructure.external.vector_store.PGVectorManager.get_table_name")
    @patch("django.db.connection")
    def test_delete_all_vectors_calls_get_table_name_once(
        self, mock_connection, mock_get_table_name
    ):
        """get_table_name() must be called exactly once to avoid redundant reads."""
        mock_get_table_name.return_value = "videoq_scenes"
        mock_cursor = MagicMock()
        mock_cursor.rowcount = 0
        mock_connection.cursor.return_value.__enter__ = MagicMock(
            return_value=mock_cursor
        )
        mock_connection.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_connection.ops.quote_name.return_value = '"videoq_scenes"'

        delete_all_vectors()

        mock_get_table_name.assert_called_once()


class DeleteVideoVectorsTests(SimpleTestCase):
    """Tests for delete_video_vectors function"""

    @patch.object(PGVectorManager, "_get_management_store")
    def test_delete_video_vectors(self, mock_get_store):
        mock_store = MagicMock()
        mock_get_store.return_value = mock_store

        delete_video_vectors(123)

        mock_store.delete.assert_called_once_with(filter={"video_id": 123})

    @patch.object(PGVectorManager, "_get_management_store")
    @patch("app.infrastructure.external.vector_store.logger")
    def test_delete_video_vectors_error(self, mock_logger, mock_get_store):
        mock_get_store.side_effect = Exception("Database error")

        delete_video_vectors(123)

        mock_logger.warning.assert_called()


class UpdateVideoTitleTests(SimpleTestCase):
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


class DeleteAllVectorsTests(SimpleTestCase):
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
