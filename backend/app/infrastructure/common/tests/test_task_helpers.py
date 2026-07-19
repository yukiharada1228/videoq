"""
Tests for task_helpers module
"""

import os
from unittest.mock import patch

from django.test import TestCase

from app.infrastructure.common.task_helpers import BatchProcessor, TemporaryFileManager


class TemporaryFileManagerTests(TestCase):
    """Tests for TemporaryFileManager class"""

    def test_create_temp_file(self):
        """Test create_temp_file"""
        manager = TemporaryFileManager()
        temp_file = manager.create_temp_file(suffix=".txt", prefix="test_")

        self.assertTrue(os.path.exists(temp_file))
        self.assertIn(temp_file, manager.temp_files)
        self.assertTrue(temp_file.endswith(".txt"))
        self.assertTrue(os.path.basename(temp_file).startswith("test_"))

    def test_cleanup_all(self):
        """Test cleanup_all"""
        manager = TemporaryFileManager()
        temp_file1 = manager.create_temp_file()
        temp_file2 = manager.create_temp_file()

        self.assertTrue(os.path.exists(temp_file1))
        self.assertTrue(os.path.exists(temp_file2))

        manager.cleanup_all()

        self.assertFalse(os.path.exists(temp_file1))
        self.assertFalse(os.path.exists(temp_file2))
        self.assertEqual(len(manager.temp_files), 0)

    def test_context_manager(self):
        """Test TemporaryFileManager as context manager"""
        with TemporaryFileManager() as manager:
            temp_file = manager.create_temp_file()
            self.assertTrue(os.path.exists(temp_file))

        # File should be cleaned up after context exit
        self.assertFalse(os.path.exists(temp_file))

    @patch("app.infrastructure.common.task_helpers.logger")
    def test_cleanup_all_with_error(self, mock_logger):
        """Test cleanup_all with error during cleanup"""
        manager = TemporaryFileManager()
        manager.create_temp_file()
        manager.cleanup_all()

        # Try to cleanup again (file doesn't exist)
        manager.cleanup_all()

        # Should not raise exception
        self.assertEqual(len(manager.temp_files), 0)


class BatchProcessorTests(TestCase):
    """Tests for BatchProcessor class"""

    def test_process_in_batches(self):
        """Test process_in_batches"""
        items = [1, 2, 3, 4, 5, 6, 7]

        def process_func(batch):
            return [x * 2 for x in batch]

        results = BatchProcessor.process_in_batches(
            items, batch_size=3, process_func=process_func
        )

        self.assertEqual(results, [2, 4, 6, 8, 10, 12, 14])

    def test_process_in_batches_with_args(self):
        """Test process_in_batches with additional arguments"""
        items = [1, 2, 3]

        def process_func(batch, multiplier):
            return [x * multiplier for x in batch]

        results = BatchProcessor.process_in_batches(
            items, batch_size=2, process_func=process_func, multiplier=3
        )

        self.assertEqual(results, [3, 6, 9])

    def test_process_in_batches_empty_list(self):
        """Test process_in_batches with empty list"""
        results = BatchProcessor.process_in_batches(
            [], batch_size=3, process_func=lambda x: x
        )

        self.assertEqual(results, [])

    def test_database_transaction_success(self):
        """Test database_transaction context manager with success"""
        with BatchProcessor.database_transaction():
            # Should not raise exception
            pass

    def test_database_transaction_error(self):
        """Test database_transaction context manager with error"""
        with self.assertRaises(ValueError):
            with BatchProcessor.database_transaction():
                raise ValueError("Test error")
