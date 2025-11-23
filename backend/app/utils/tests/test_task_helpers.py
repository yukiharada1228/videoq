"""
Tests for task_helpers module
"""

import os
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from app.models import Video
from app.utils.task_helpers import (BatchProcessor, ErrorHandler,
                                    TemporaryFileManager, VideoTaskManager)

User = get_user_model()


class VideoTaskManagerTests(TestCase):
    """Tests for VideoTaskManager class"""

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
            status="pending",
        )

    def test_get_video_with_user_success(self):
        """Test get_video_with_user with existing video"""
        video, error = VideoTaskManager.get_video_with_user(self.video.id)

        self.assertIsNotNone(video)
        self.assertIsNone(error)
        self.assertEqual(video.id, self.video.id)
        # Should not cause additional query when accessing user
        with self.assertNumQueries(0):
            _ = video.user

    def test_get_video_with_user_not_found(self):
        """Test get_video_with_user with non-existent video"""
        video, error = VideoTaskManager.get_video_with_user(99999)

        self.assertIsNone(video)
        self.assertIsNotNone(error)
        self.assertIn("not found", error)

    @patch("app.utils.task_helpers.logger")
    def test_get_video_with_user_error(self, mock_logger):
        """Test get_video_with_user with database error"""
        with patch.object(Video.objects, "select_related") as mock_select:
            mock_select.return_value.get.side_effect = Exception("Database error")

            video, error = VideoTaskManager.get_video_with_user(self.video.id)

            self.assertIsNone(video)
            self.assertIsNotNone(error)
            mock_logger.error.assert_called()

    def test_update_video_status_success(self):
        """Test update_video_status with success"""
        result = VideoTaskManager.update_video_status(self.video, "completed", "")

        self.assertTrue(result)
        self.video.refresh_from_db()
        self.assertEqual(self.video.status, "completed")

    def test_update_video_status_with_error_message(self):
        """Test update_video_status with error message"""
        result = VideoTaskManager.update_video_status(self.video, "error", "Test error")

        self.assertTrue(result)
        self.video.refresh_from_db()
        self.assertEqual(self.video.status, "error")
        self.assertEqual(self.video.error_message, "Test error")

    @patch("app.utils.task_helpers.logger")
    def test_update_video_status_error(self, mock_logger):
        """Test update_video_status with error"""
        with patch.object(self.video, "save", side_effect=Exception("Save error")):
            result = VideoTaskManager.update_video_status(self.video, "completed", "")

            self.assertFalse(result)
            mock_logger.error.assert_called()

    def test_validate_video_for_processing_success(self):
        """Test validate_video_for_processing with valid video"""
        # Create a video with file
        video_file = SimpleUploadedFile(
            "test_video.mp4", b"file content", content_type="video/mp4"
        )
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
            file=video_file,
            status="pending",
        )

        is_valid, error = VideoTaskManager.validate_video_for_processing(video)

        self.assertTrue(is_valid)
        self.assertIsNone(error)

    def test_validate_video_for_processing_no_file(self):
        """Test validate_video_for_processing without file"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="pending",
        )

        is_valid, error = VideoTaskManager.validate_video_for_processing(video)

        self.assertFalse(is_valid)
        self.assertIsNotNone(error)
        self.assertIn("file", error.lower())


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

    @patch("app.utils.task_helpers.logger")
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


class ErrorHandlerTests(TestCase):
    """Tests for ErrorHandler class"""

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
            status="pending",
        )

    @patch("app.utils.task_helpers.logger")
    @patch("app.utils.task_helpers.VideoTaskManager.update_video_status")
    def test_handle_task_error(self, mock_update, mock_logger):
        """Test handle_task_error"""
        error = ValueError("Test error")
        task_instance = None

        with self.assertRaises(ValueError):
            ErrorHandler.handle_task_error(error, self.video.id, task_instance)

        mock_logger.error.assert_called()
        mock_update.assert_called_once()

    @patch("app.utils.task_helpers.logger")
    def test_handle_task_error_with_retry(self, mock_logger):
        """Test handle_task_error with retry logic"""
        error = ValueError("Test error")
        task_instance = Mock()
        task_instance.request.retries = 0

        with self.assertRaises(ValueError):
            ErrorHandler.handle_task_error(
                error, self.video.id, task_instance, max_retries=3
            )

        task_instance.retry.assert_called_once()

    @patch("app.utils.task_helpers.logger")
    def test_handle_task_error_max_retries(self, mock_logger):
        """Test handle_task_error with max retries reached"""
        error = ValueError("Test error")
        task_instance = Mock()
        task_instance.request.retries = 3

        with self.assertRaises(ValueError):
            ErrorHandler.handle_task_error(
                error, self.video.id, task_instance, max_retries=3
            )

        task_instance.retry.assert_not_called()

    def test_safe_execute_success(self):
        """Test safe_execute with success"""

        def test_func(x, y):
            return x + y

        result, error = ErrorHandler.safe_execute(test_func, 1, 2)

        self.assertEqual(result, 3)
        self.assertIsNone(error)

    def test_safe_execute_error(self):
        """Test safe_execute with error"""

        def test_func():
            raise ValueError("Test error")

        result, error = ErrorHandler.safe_execute(test_func)

        self.assertIsNone(result)
        self.assertIsNotNone(error)
        self.assertIsInstance(error, ValueError)

    @patch("app.utils.task_helpers.logger")
    def test_handle_database_error(self, mock_logger):
        """Test handle_database_error"""
        error = ValueError("Database error")

        with self.assertRaises(ValueError):
            ErrorHandler.handle_database_error(error, "test_operation")

        mock_logger.error.assert_called()

    def test_validate_required_fields_success(self):
        """Test validate_required_fields with all fields present"""
        data = {"field1": "value1", "field2": "value2", "field3": "value3"}
        required_fields = ["field1", "field2", "field3"]

        is_valid, error = ErrorHandler.validate_required_fields(data, required_fields)

        self.assertTrue(is_valid)
        self.assertEqual(error, "")

    def test_validate_required_fields_missing(self):
        """Test validate_required_fields with missing fields"""
        data = {"field1": "value1"}
        required_fields = ["field1", "field2", "field3"]

        is_valid, error = ErrorHandler.validate_required_fields(data, required_fields)

        self.assertFalse(is_valid)
        self.assertIn("field2", error)
        self.assertIn("field3", error)

    def test_validate_required_fields_empty_value(self):
        """Test validate_required_fields with empty value"""
        data = {"field1": "", "field2": None}
        required_fields = ["field1", "field2"]

        is_valid, error = ErrorHandler.validate_required_fields(data, required_fields)

        self.assertFalse(is_valid)
        self.assertIn("field1", error)
        self.assertIn("field2", error)
