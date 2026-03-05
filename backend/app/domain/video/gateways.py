"""
Gateway interfaces for the video domain.
Abstract contracts for external services used by video use cases.
"""

from abc import ABC, abstractmethod


class VectorStoreGateway(ABC):
    """Abstract interface for vector store metadata operations."""

    @abstractmethod
    def update_video_title(self, video_id: int, new_title: str) -> None:
        """Update the video title stored in the vector metadata."""
        ...


class VideoTaskGateway(ABC):
    """Abstract interface for enqueueing async video background tasks."""

    @abstractmethod
    def enqueue_transcription(self, video_id: int) -> None:
        """Enqueue a video transcription task (dispatched after DB commit)."""
        ...


class VectorIndexingGateway(ABC):
    """Abstract interface for vector store indexing operations."""

    @abstractmethod
    def index_video_transcript(
        self, video_id: int, user_id: int, title: str, transcript: str
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
    def run(self, video_id: int) -> str:
        """
        Download video audio, transcribe via Whisper, and apply scene splitting.

        Returns:
            SRT-formatted transcript string.
        """
        ...
