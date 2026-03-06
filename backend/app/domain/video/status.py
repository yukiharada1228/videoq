"""Video processing status value object and transition rules."""

from enum import Enum
from typing import Dict, Set

from app.domain.video.exceptions import InvalidVideoStatusTransition


class VideoStatus(str, Enum):
    """Canonical video processing statuses used across the domain."""

    PENDING = "pending"
    PROCESSING = "processing"
    INDEXING = "indexing"
    COMPLETED = "completed"
    ERROR = "error"

    @classmethod
    def from_value(cls, value: str) -> "VideoStatus":
        return cls(value)

    def can_transition_to(self, next_status: "VideoStatus") -> bool:
        allowed = _ALLOWED_TRANSITIONS.get(self, set())
        return next_status in allowed

    def assert_transition_to(self, next_status: "VideoStatus") -> None:
        if not self.can_transition_to(next_status):
            raise InvalidVideoStatusTransition(self.value, next_status.value)


_ALLOWED_TRANSITIONS: Dict[VideoStatus, Set[VideoStatus]] = {
    VideoStatus.PENDING: {VideoStatus.PROCESSING},
    VideoStatus.PROCESSING: {VideoStatus.INDEXING, VideoStatus.ERROR},
    VideoStatus.INDEXING: {VideoStatus.COMPLETED, VideoStatus.ERROR},
    VideoStatus.COMPLETED: {VideoStatus.PROCESSING},
    VideoStatus.ERROR: {VideoStatus.PROCESSING},
}
