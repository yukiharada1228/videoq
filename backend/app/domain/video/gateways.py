"""
Gateway interfaces for the video domain.
Abstract contracts for external services used by video use cases.
"""

from abc import ABC, abstractmethod
from typing import Optional


class VectorStoreGateway(ABC):
    """Abstract interface for vector store metadata operations."""

    @abstractmethod
    def update_video_title(self, video_id: int, new_title: str) -> None:
        """Update the video title stored in the vector metadata."""
        ...

    @abstractmethod
    def delete_video_vectors(self, video_id: int) -> None:
        """Delete all vectors associated with a video."""
        ...


class VideoTaskGateway(ABC):
    """Abstract interface for enqueueing async video background tasks."""

    @abstractmethod
    def enqueue_transcription(self, video_id: int) -> None:
        """Enqueue a video transcription task (dispatched after DB commit)."""
        ...

    @abstractmethod
    def enqueue_indexing(self, video_id: int) -> None:
        """Enqueue a vector indexing task for a single video (dispatched after DB commit)."""
        ...

    @abstractmethod
    def enqueue_reindex_all_videos_embeddings(self) -> str:
        """Enqueue full re-indexing task and return the created task id."""
        ...


class VectorIndexingGateway(ABC):
    """Abstract interface for vector store indexing operations."""

    @abstractmethod
    def index_video_transcript(
        self, video_id: int, user_id: int, title: str, transcript: str,
        api_key: Optional[str] = None,
    ) -> None:
        """Parse transcript and index all scenes to the vector store."""
        ...

    @abstractmethod
    def delete_all_vectors(self) -> int:
        """Delete all stored vectors. Returns number of deleted records."""
        ...


class TranscriptionGateway(ABC):
    """Abstract interface for video transcription (audio processing + speech-to-text)."""

    @abstractmethod
    def run(self, video_id: int, api_key: Optional[str] = None) -> str:
        """
        Download video audio, transcribe via Whisper, and apply scene splitting.

        Returns:
            SRT-formatted transcript string.
        """
        ...


class FileUploadGateway(ABC):
    """Abstract interface for generating presigned upload URLs."""

    @abstractmethod
    def generate_upload_url(self, file_key: str, content_type: str) -> str:
        """Generate a presigned PUT URL for direct file upload."""
        ...

    @abstractmethod
    def get_file_size(self, file_key: str) -> int:
        """Get the actual file size in bytes from storage via head_object."""
        ...

    @abstractmethod
    def delete_file(self, file_key: str) -> None:
        """Delete a file from storage."""
        ...
