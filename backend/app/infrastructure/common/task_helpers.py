"""Common task processing utilities."""

import logging
import os
import tempfile
from types import TracebackType
from typing import List

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
