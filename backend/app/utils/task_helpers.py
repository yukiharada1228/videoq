"""
Common task processing utilities
"""

import logging
import os
import tempfile
from contextlib import contextmanager
from typing import Any, List, Optional, Tuple

from django.db import transaction

from app.models import Video

logger = logging.getLogger(__name__)


class VideoTaskManager:
    """Common management class for video task processing"""

    @staticmethod
    def get_video_with_user(video_id: int) -> Tuple[Optional[Video], Optional[str]]:
        """
        Get video and user information at once (N+1 prevention)

        Returns:
            (video, error_message)
        """
        try:
            video = Video.objects.select_related("user").get(id=video_id)
            return video, None
        except Video.DoesNotExist:
            error_msg = f"Video with id {video_id} not found"
            logger.error(error_msg)
            return None, error_msg
        except Exception as e:
            error_msg = f"Error fetching video: {e}"
            logger.error(error_msg)
            return None, error_msg

    @staticmethod
    def update_video_status(video: Video, status: str, error_message: str = "") -> bool:
        """
        Update video status

        Returns:
            bool: Whether update succeeded
        """
        try:
            video.status = status
            video.error_message = error_message
            video.save(update_fields=["status", "error_message"])
            logger.info(f"Updated video {video.id} status to {status}")
            return True
        except Exception as e:
            logger.error(f"Failed to update video {video.id} status: {e}")
            return False

    @staticmethod
    def validate_video_for_processing(video: Video) -> Tuple[bool, Optional[str]]:
        """
        Validate video processability
        Supports both file uploads and YouTube URLs

        Returns:
            (is_valid, error_message)
        """
        # Check if video has either file or YouTube URL
        has_file = bool(video.file)
        has_youtube_url = bool(video.youtube_url)

        if not has_file and not has_youtube_url:
            return False, "Either video file or YouTube URL must be provided"

        # Validate file if present
        if has_file:
            # S3 support: Check file existence
            try:
                # Local filesystem case
                if not os.path.exists(video.file.path):
                    return False, f"Video file not found: {video.file.path}"
            except (NotImplementedError, AttributeError):
                # Remote storage like S3 case
                # Check if file object exists
                try:
                    video.file.open("rb").close()
                except Exception as e:
                    return False, f"Video file not accessible: {e}"

        # Validate YouTube URL if present
        if has_youtube_url:
            from app.utils.youtube import validate_youtube_url

            is_valid, error_msg = validate_youtube_url(video.youtube_url)
            if not is_valid:
                return False, f"Invalid YouTube URL: {error_msg}"

        if not video.user.encrypted_openai_api_key:
            return False, "OpenAI API key is not configured"

        return True, None


class TemporaryFileManager:
    """Common temporary file management class"""

    def __init__(self):
        self.temp_files: List[str] = []

    def create_temp_file(self, suffix: str = "", prefix: str = "temp_") -> str:
        """Create temporary file and add to management list"""
        temp_file = tempfile.NamedTemporaryFile(
            suffix=suffix, prefix=prefix, delete=False
        )
        temp_file.close()
        self.temp_files.append(temp_file.name)
        return temp_file.name

    def cleanup_all(self):
        """Delete all managed temporary files"""
        for temp_file in self.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                    logger.debug(f"Cleaned up temporary file: {temp_file}")
            except Exception as e:
                logger.warning(f"Error cleaning up temporary file {temp_file}: {e}")
        self.temp_files.clear()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup_all()


class BatchProcessor:
    """Common batch processing class (N+1 prevention)"""

    @staticmethod
    def process_in_batches(
        items: List[Any], batch_size: int, process_func, *args, **kwargs
    ) -> List[Any]:
        """
        Process items in batches (N+1 prevention)

        Args:
            items: List of items to process
            batch_size: Batch size
            process_func: Processing function
            *args, **kwargs: Arguments to pass to processing function

        Returns:
            List of processing results
        """
        results = []
        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            batch_results = process_func(batch, *args, **kwargs)
            results.extend(batch_results)
        return results

    @staticmethod
    @contextmanager
    def database_transaction():
        """Database transaction context manager"""
        try:
            with transaction.atomic():
                yield
        except Exception as e:
            logger.error(f"Database transaction failed: {e}")
            raise


class ErrorHandler:
    """Common error handling class"""

    @staticmethod
    def handle_task_error(
        error: Exception, video_id: int, task_instance=None, max_retries: int = 3
    ) -> None:
        """
        Common task error handling

        Args:
            error: Occurred error
            video_id: Video ID
            task_instance: Celery task instance
            max_retries: Maximum retry count
        """
        logger.error(f"Error in task for video {video_id}: {error}", exc_info=True)

        # N+1 prevention: Update video status to error (select_related not needed)
        try:
            video = Video.objects.only("id").get(id=video_id)
            VideoTaskManager.update_video_status(video, "error", str(error))
        except Exception as update_error:
            logger.error(f"Failed to update video status: {update_error}")

        ErrorHandler._handle_retry_logic(task_instance, error, max_retries)

        raise error

    @staticmethod
    def _handle_retry_logic(task_instance, error: Exception, max_retries: int) -> None:
        """
        Common retry logic
        """
        if task_instance and task_instance.request.retries < max_retries:
            logger.info(
                f"Retrying task (attempt {task_instance.request.retries + 1}/{max_retries})"
            )
            task_instance.retry(
                exc=error, countdown=60 * (task_instance.request.retries + 1)
            )

    @staticmethod
    def safe_execute(func, *args, **kwargs):
        """
        Safe function execution

        Returns:
            (result, error)
        """
        try:
            result = func(*args, **kwargs)
            return result, None
        except Exception as e:
            logger.error(f"Error executing function {func.__name__}: {e}")
            return None, e

    @staticmethod
    def handle_database_error(error: Exception, operation: str) -> None:
        """
        Common database error handling
        """
        logger.error(f"Database error during {operation}: {error}", exc_info=True)
        raise error

    @staticmethod
    def validate_required_fields(data: dict, required_fields: list) -> tuple[bool, str]:
        """
        Validate required fields

        Returns:
            (is_valid, error_message)
        """
        missing_fields = [
            field for field in required_fields if field not in data or not data[field]
        ]
        if missing_fields:
            return False, f"Missing required fields: {', '.join(missing_fields)}"
        return True, ""
