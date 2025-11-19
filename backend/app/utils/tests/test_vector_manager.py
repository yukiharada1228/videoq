"""
Tests for vector_manager module
"""

import os
from unittest.mock import MagicMock, patch

from django.test import TestCase

from app.utils.vector_manager import (PGVectorManager, delete_video_vectors,
                                      delete_video_vectors_batch,
                                      update_video_title_in_vectors)


class PGVectorManagerTests(TestCase):
    """Tests for PGVectorManager class"""

    def setUp(self):
        """Reset singleton state"""
        PGVectorManager._config = None
        PGVectorManager._connection = None

    def tearDown(self):
        """Clean up"""
        PGVectorManager.close_connection()

    @patch.dict(
        os.environ, {"DATABASE_URL": "postgresql://test:test@localhost:5432/test"}
    )
    def test_get_config(self):
        """Test get_config"""
        config = PGVectorManager.get_config()

        self.assertIsNotNone(config)
        self.assertIn("database_url", config)
        self.assertIn("collection_name", config)
        self.assertEqual(
            config["database_url"], "postgresql://test:test@localhost:5432/test"
        )

    @patch.dict(os.environ, {}, clear=True)
    def test_get_config_default(self):
        """Test get_config with default values"""
        config = PGVectorManager.get_config()

        self.assertIsNotNone(config)
        self.assertIn("database_url", config)
        self.assertIn("collection_name", config)

    @patch("app.utils.vector_manager.register_vector")
    @patch("app.utils.vector_manager.psycopg2.connect")
    def test_get_connection(self, mock_connect, mock_register):
        """Test get_connection"""
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_connect.return_value = mock_conn
        # Mock register_vector to avoid database connection
        mock_register.return_value = None

        conn = PGVectorManager.get_connection()

        self.assertIsNotNone(conn)
        mock_connect.assert_called_once()
        mock_register.assert_called_once_with(mock_conn)

    @patch("app.utils.vector_manager.register_vector")
    @patch("app.utils.vector_manager.psycopg2.connect")
    def test_get_connection_reuses_existing(self, mock_connect, mock_register):
        """Test get_connection reuses existing connection"""
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_connect.return_value = mock_conn
        mock_register.return_value = None

        conn1 = PGVectorManager.get_connection()
        conn2 = PGVectorManager.get_connection()

        self.assertEqual(conn1, conn2)
        # Should only connect once
        self.assertEqual(mock_connect.call_count, 1)

    @patch("app.utils.vector_manager.register_vector")
    @patch("app.utils.vector_manager.psycopg2.connect")
    def test_close_connection(self, mock_connect, mock_register):
        """Test close_connection"""
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_connect.return_value = mock_conn
        mock_register.return_value = None

        PGVectorManager.get_connection()
        PGVectorManager.close_connection()

        mock_conn.close.assert_called_once()
        self.assertIsNone(PGVectorManager._connection)

    @patch("app.utils.vector_manager.register_vector")
    @patch("app.utils.vector_manager.psycopg2.connect")
    def test_execute_with_connection_success(self, mock_connect, mock_register):
        """Test execute_with_connection with successful operation"""
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn
        mock_register.return_value = None

        def operation(cursor):
            return "result"

        result = PGVectorManager.execute_with_connection(operation)

        self.assertEqual(result, "result")
        mock_conn.commit.assert_called_once()
        mock_cursor.close.assert_called_once()

    @patch("app.utils.vector_manager.register_vector")
    @patch("app.utils.vector_manager.psycopg2.connect")
    def test_execute_with_connection_error(self, mock_connect, mock_register):
        """Test execute_with_connection with error"""
        mock_conn = MagicMock()
        mock_conn.closed = False
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn
        mock_register.return_value = None

        def operation(cursor):
            raise ValueError("Test error")

        with self.assertRaises(ValueError):
            PGVectorManager.execute_with_connection(operation)

        mock_conn.rollback.assert_called_once()
        mock_cursor.close.assert_called_once()

    def test_get_psycopg_connection_string(self):
        """Test get_psycopg_connection_string"""
        with patch.object(PGVectorManager, "get_config") as mock_config:
            mock_config.return_value = {
                "database_url": "postgresql://user:pass@host:5432/db",
            }

            result = PGVectorManager.get_psycopg_connection_string()

            self.assertEqual(result, "postgresql+psycopg://user:pass@host:5432/db")

    def test_get_psycopg_connection_string_already_converted(self):
        """Test get_psycopg_connection_string with already converted string"""
        with patch.object(PGVectorManager, "get_config") as mock_config:
            mock_config.return_value = {
                "database_url": "postgresql+psycopg://user:pass@host:5432/db",
            }

            result = PGVectorManager.get_psycopg_connection_string()

            self.assertEqual(result, "postgresql+psycopg://user:pass@host:5432/db")


class VectorOperationsTests(TestCase):
    """Tests for vector operations"""

    @patch("app.utils.vector_manager.PGVectorManager.execute_with_connection")
    @patch("app.utils.vector_manager.PGVectorManager.get_config")
    @patch("app.utils.vector_manager.logger")
    def test_delete_video_vectors(self, mock_logger, mock_config, mock_execute):
        """Test delete_video_vectors"""
        mock_config.return_value = {"collection_name": "test_collection"}
        mock_execute.return_value = 5

        result = delete_video_vectors(123)

        self.assertIsNone(result)  # Function doesn't return anything
        mock_execute.assert_called_once()
        mock_logger.info.assert_called()

    @patch("app.utils.vector_manager.PGVectorManager.execute_with_connection")
    @patch("app.utils.vector_manager.PGVectorManager.get_config")
    @patch("app.utils.vector_manager.logger")
    def test_delete_video_vectors_no_results(
        self, mock_logger, mock_config, mock_execute
    ):
        """Test delete_video_vectors with no results"""
        mock_config.return_value = {"collection_name": "test_collection"}
        mock_execute.return_value = 0

        delete_video_vectors(123)

        mock_logger.info.assert_called()

    @patch("app.utils.vector_manager.PGVectorManager.execute_with_connection")
    @patch("app.utils.vector_manager.PGVectorManager.get_config")
    @patch("app.utils.vector_manager.logger")
    def test_delete_video_vectors_error(self, mock_logger, mock_config, mock_execute):
        """Test delete_video_vectors with error"""
        mock_config.return_value = {"collection_name": "test_collection"}
        mock_execute.side_effect = Exception("Database error")

        delete_video_vectors(123)

        mock_logger.warning.assert_called()

    @patch("app.utils.vector_manager.PGVectorManager.execute_with_connection")
    @patch("app.utils.vector_manager.PGVectorManager.get_config")
    @patch("app.utils.vector_manager.logger")
    def test_delete_video_vectors_batch(self, mock_logger, mock_config, mock_execute):
        """Test delete_video_vectors_batch"""
        mock_config.return_value = {"collection_name": "test_collection"}
        mock_execute.return_value = 10

        delete_video_vectors_batch([1, 2, 3])

        mock_execute.assert_called_once()
        mock_logger.info.assert_called()

    @patch("app.utils.vector_manager.logger")
    def test_delete_video_vectors_batch_empty(self, mock_logger):
        """Test delete_video_vectors_batch with empty list"""
        delete_video_vectors_batch([])

        mock_logger.info.assert_not_called()

    @patch("app.utils.vector_manager.PGVectorManager.execute_with_connection")
    @patch("app.utils.vector_manager.logger")
    def test_update_video_title_in_vectors(self, mock_logger, mock_execute):
        """Test update_video_title_in_vectors"""
        mock_execute.return_value = 3

        result = update_video_title_in_vectors(123, "New Title")

        self.assertEqual(result, 3)
        mock_execute.assert_called_once()
        mock_logger.info.assert_called()

    @patch("app.utils.vector_manager.PGVectorManager.execute_with_connection")
    @patch("app.utils.vector_manager.logger")
    def test_update_video_title_in_vectors_no_results(self, mock_logger, mock_execute):
        """Test update_video_title_in_vectors with no results"""
        mock_execute.return_value = 0

        result = update_video_title_in_vectors(123, "New Title")

        self.assertEqual(result, 0)
        mock_logger.info.assert_called()

    @patch("app.utils.vector_manager.PGVectorManager.execute_with_connection")
    @patch("app.utils.vector_manager.logger")
    def test_update_video_title_in_vectors_error(self, mock_logger, mock_execute):
        """Test update_video_title_in_vectors with error"""
        mock_execute.side_effect = Exception("Database error")

        result = update_video_title_in_vectors(123, "New Title")

        self.assertEqual(result, 0)
        mock_logger.warning.assert_called()
