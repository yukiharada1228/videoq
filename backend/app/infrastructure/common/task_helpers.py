"""Common task processing utilities."""

import logging
import os
import tempfile
from contextlib import contextmanager
from typing import Any, List, Optional, Tuple

from django.db import transaction

from app.models import Video

logger = logging.getLogger(__name__)


class VideoTaskManager:
    """Common management class for video task processing."""

    @staticmethod
    def get_video_with_user(video_id: int) -> Tuple[Optional[Video], Optional[str]]:
        """Get video and user information at once."""
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
        """Update video status."""
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
        """Validate video processability."""
        if not video.file:
            return False, "Video file is not available"

        try:
            if not os.path.exists(video.file.path):
                return False, f"Video file not found: {video.file.path}"
        except (NotImplementedError, AttributeError):
            try:
                video.file.open("rb").close()
            except Exception as e:
                return False, f"Video file not accessible: {e}"

        return True, None


class TemporaryFileManager:
    """Common temporary file management class."""

    def __init__(self):
        self.temp_files: List[str] = []

    def create_temp_file(self, suffix: str = "", prefix: str = "temp_") -> str:
        """Create temporary file and add to management list."""
        temp_file = tempfile.NamedTemporaryFile(
            suffix=suffix, prefix=prefix, delete=False
        )
        temp_file.close()
        self.temp_files.append(temp_file.name)
        return temp_file.name

    def cleanup_all(self):
        """Delete all managed temporary files."""
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
    """Common batch processing class."""

    @staticmethod
    def process_in_batches(
        items: List[Any], batch_size: int, process_func, *args, **kwargs
    ) -> List[Any]:
        """Process items in batches."""
        results = []
        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            batch_results = process_func(batch, *args, **kwargs)
            results.extend(batch_results)
        return results

    @staticmethod
    @contextmanager
    def database_transaction():
        """Database transaction context manager."""
        try:
            with transaction.atomic():
                yield
        except Exception as e:
            logger.error(f"Database transaction failed: {e}")
            raise


class ErrorHandler:
    """Common error handling class."""

    @staticmethod
    def handle_task_error(
        error: Exception, video_id: int, task_instance=None, max_retries: int = 3
    ) -> None:
        """Common task error handling."""
        logger.error(f"Error in task for video {video_id}: {error}", exc_info=True)

        try:
            video = Video.objects.only("id").get(id=video_id)
            VideoTaskManager.update_video_status(video, "error", str(error))
        except Exception as update_error:
            logger.error(f"Failed to update video status: {update_error}")

        ErrorHandler._handle_retry_logic(task_instance, error, max_retries)

        raise error

    @staticmethod
    def _handle_retry_logic(task_instance, error: Exception, max_retries: int) -> None:
        """Common retry logic."""
        if task_instance and task_instance.request.retries < max_retries:
            logger.info(
                f"Retrying task (attempt {task_instance.request.retries + 1}/{max_retries})"
            )
            task_instance.retry(
                exc=error, countdown=60 * (task_instance.request.retries + 1)
            )

    @staticmethod
    def safe_execute(func, *args, **kwargs):
        """Safe function execution."""
        try:
            result = func(*args, **kwargs)
            return result, None
        except Exception as e:
            logger.error(f"Error executing function {func.__name__}: {e}")
            return None, e

    @staticmethod
    def handle_database_error(error: Exception, operation: str) -> None:
        """Common database error handling."""
        logger.error(f"Database error during {operation}: {error}", exc_info=True)
        raise error

    @staticmethod
    def validate_required_fields(data: dict, required_fields: list) -> tuple[bool, str]:
        """Validate required fields."""
        missing_fields = [
            field for field in required_fields if field not in data or not data[field]
        ]
        if missing_fields:
            return False, f"Missing required fields: {', '.join(missing_fields)}"
        return True, ""
