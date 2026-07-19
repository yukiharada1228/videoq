"""Common task processing utilities."""

import logging
import os
import tempfile
from contextlib import contextmanager
from types import TracebackType
from typing import Any, Generator, List

from django.db import transaction

logger = logging.getLogger(__name__)


class TemporaryFileManager:
    """Common temporary file management class."""

    def __init__(self) -> None:
        self.temp_files: List[str] = []

    def create_temp_file(self, suffix: str = "", prefix: str = "temp_") -> str:
        """Create temporary file and add to management list."""
        temp_file = tempfile.NamedTemporaryFile(
            suffix=suffix, prefix=prefix, delete=False
        )
        temp_file.close()
        self.temp_files.append(temp_file.name)
        return temp_file.name

    def cleanup_all(self) -> None:
        """Delete all managed temporary files."""
        for temp_file in self.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                    logger.debug(f"Cleaned up temporary file: {temp_file}")
            except Exception as e:
                logger.warning(f"Error cleaning up temporary file {temp_file}: {e}")
        self.temp_files.clear()

    def __enter__(self) -> "TemporaryFileManager":
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
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
    def database_transaction() -> Generator[None, None, None]:
        """Database transaction context manager."""
        try:
            with transaction.atomic():
                yield
        except Exception as e:
            logger.error(f"Database transaction failed: {e}")
            raise
