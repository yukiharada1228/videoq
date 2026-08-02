"""Video processing status transitions (mirrors app.domain.video.status)."""

from __future__ import annotations

from enum import Enum


class InvalidVideoStatusTransition(Exception):
    def __init__(self, from_status: str, to_status: str) -> None:
        super().__init__(f"Invalid transition: {from_status} -> {to_status}")
        self.from_status = from_status
        self.to_status = to_status


class VideoStatus(str, Enum):
    UPLOADING = "uploading"
    PENDING = "pending"
    PROCESSING = "processing"
    INDEXING = "indexing"
    COMPLETED = "completed"
    ERROR = "error"


_ALLOWED: dict[VideoStatus, set[VideoStatus]] = {
    VideoStatus.UPLOADING: {VideoStatus.PENDING, VideoStatus.ERROR},
    VideoStatus.PENDING: {VideoStatus.PROCESSING},
    VideoStatus.PROCESSING: {VideoStatus.INDEXING, VideoStatus.ERROR},
    VideoStatus.INDEXING: {VideoStatus.COMPLETED, VideoStatus.ERROR},
    VideoStatus.COMPLETED: {VideoStatus.PROCESSING},
    VideoStatus.ERROR: {VideoStatus.PROCESSING},
}


def assert_transition(from_status: str, to_status: VideoStatus) -> None:
    current = VideoStatus(from_status)
    if to_status not in _ALLOWED.get(current, set()):
        raise InvalidVideoStatusTransition(current.value, to_status.value)


def plan_transcription_start(current_status: str) -> tuple[VideoStatus, VideoStatus]:
    from_status = VideoStatus(current_status)
    to_status = VideoStatus.PROCESSING
    assert_transition(from_status.value, to_status)
    return from_status, to_status


def plan_transcription_success() -> tuple[VideoStatus, VideoStatus]:
    return VideoStatus.PROCESSING, VideoStatus.INDEXING


def plan_transcription_failure() -> tuple[VideoStatus, VideoStatus]:
    return VideoStatus.PROCESSING, VideoStatus.ERROR


def plan_indexing_success() -> tuple[VideoStatus, VideoStatus]:
    return VideoStatus.INDEXING, VideoStatus.COMPLETED


def plan_indexing_failure() -> tuple[VideoStatus, VideoStatus]:
    return VideoStatus.INDEXING, VideoStatus.ERROR
