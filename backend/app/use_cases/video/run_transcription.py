"""
Use case: Transcribe a video and index its scenes for RAG search.
"""

import logging
import re

from typing import Callable, Optional

from app.domain.shared.transaction import TransactionPort
from app.domain.user.repositories import UserRepository
from app.domain.video.gateways import FileUploadGateway, TranscriptionGateway, VideoTaskGateway
from app.domain.video.repositories import VideoRepository
from app.domain.video.services import VideoTranscriptionLifecycle
from app.use_cases.video.exceptions import (
    FileSizeExceeded,
    TranscriptionExecutionFailed,
    TranscriptionTargetMissing,
)

logger = logging.getLogger(__name__)

# SRT timestamp pattern: HH:MM:SS,mmm
_SRT_TIME_RE = re.compile(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})")


def _parse_srt_duration_seconds(srt_content: str) -> Optional[int]:
    """Return the duration in whole seconds from the last end-timestamp in an SRT string.

    SRT lines look like:
        00:00:01,000 --> 00:00:04,500
    We collect all timestamps from the arrow (-->) side and take the maximum.
    Returns None if no timestamp can be found.
    """
    # Find timestamps after " --> "
    end_timestamps = re.findall(r"-->\s*" + _SRT_TIME_RE.pattern, srt_content)
    if not end_timestamps:
        return None
    max_seconds: float = 0.0
    for h, m, s, ms in end_timestamps:
        total = int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0
        if total > max_seconds:
            max_seconds = total
    return int(max_seconds) or None


class RunTranscriptionUseCase:
    """
    Orchestrates video transcription:
    1. Validate video exists and is ready for processing
    2. Verify file size does not exceed limit
    3. Transition status PENDING/ERROR → PROCESSING
    4. Run transcription (audio extraction + Whisper + scene splitting)
    5. Persist transcript and transition status PROCESSING → INDEXING
    6. Enqueue async indexing task (INDEXING → COMPLETED handled by IndexVideoTranscriptUseCase)
    On error: transition status PROCESSING → ERROR and re-raise.
    7. (Optional) Record processing usage for billing
    """

    def __init__(
        self,
        video_repo: VideoRepository,
        transcription_gateway: TranscriptionGateway,
        task_queue: VideoTaskGateway,
        upload_gateway: FileUploadGateway,
        tx: TransactionPort,
        user_repo: Optional[UserRepository] = None,
        duration_estimator: Optional[Callable[[int], Optional[int]]] = None,
        processing_limit_check_use_case=None,
        processing_record_use_case=None,
    ):
        self.video_repo = video_repo
        self.transcription_gateway = transcription_gateway
        self.task_queue = task_queue
        self.upload_gateway = upload_gateway
        self.tx = tx
        self.user_repo = user_repo
        self._duration_estimator = duration_estimator
        self._processing_limit_check_use_case = processing_limit_check_use_case
        self._processing_record_use_case = processing_record_use_case

    def _estimate_video_duration_seconds(self, video_id: int) -> Optional[int]:
        if self._duration_estimator is None:
            return None
        return self._duration_estimator(video_id)

    def execute(self, video_id: int) -> None:
        video = self.video_repo.get_by_id_for_task(video_id)
        if video is None:
            raise TranscriptionTargetMissing(video_id)

        # Resolve per-user upload size limit
        max_upload_bytes = 500 * 1024 * 1024  # default fallback
        if self.user_repo is not None and video.user_id:
            user = self.user_repo.get_by_id(video.user_id)
            if user is not None:
                max_upload_bytes = user.get_max_upload_size_bytes()

        # Verify file size before starting transcription (only when a file key is present)
        if video.file_key:
            actual_size = self.upload_gateway.get_file_size(video.file_key)
            if actual_size > max_upload_bytes:
                self.upload_gateway.delete_file(video.file_key)
                self.video_repo.delete(video)
                max_mb = max_upload_bytes // (1024 * 1024)
                raise FileSizeExceeded(max_mb)

        from_status, to_status = VideoTranscriptionLifecycle.plan_start(video.status)

        try:
            logger.info("Transcription started for video %d (%s)", video.id, video.title)
            self.video_repo.transition_status(
                video_id=video_id,
                from_status=from_status,
                to_status=to_status,
            )

            if (
                self._processing_limit_check_use_case is not None
                and video.user_id
            ):
                estimated_duration_seconds = self._estimate_video_duration_seconds(video_id)
                if estimated_duration_seconds is not None:
                    self._processing_limit_check_use_case.execute(
                        video.user_id,
                        estimated_duration_seconds,
                    )

            transcript = self.transcription_gateway.run(video_id, api_key=None)
            with self.tx.atomic():
                self.video_repo.save_transcript(video_id, transcript)
                from_status, to_status = VideoTranscriptionLifecycle.plan_success()
                self.video_repo.transition_status(
                    video_id=video_id,
                    from_status=from_status,
                    to_status=to_status,
                )
                self.task_queue.enqueue_indexing(video_id)
        except Exception as e:
            error_msg = str(e)
            logger.error("Transcription failed for video %d: %s", video_id, error_msg)
            from_status, to_status = VideoTranscriptionLifecycle.plan_failure()
            self.video_repo.transition_status(
                video_id=video_id,
                from_status=from_status,
                to_status=to_status,
                error_message=error_msg,
            )
            raise TranscriptionExecutionFailed(video_id=video_id, reason=error_msg) from e

        logger.info("Transcription completed for video %d; indexing task enqueued", video_id)

        if self._processing_record_use_case is not None and video.user_id:
            duration_seconds = _parse_srt_duration_seconds(transcript)
            if duration_seconds is not None and duration_seconds > 0:
                try:
                    self._processing_record_use_case.execute(video.user_id, duration_seconds)
                except Exception:
                    logger.warning(
                        "Failed to record processing usage for user %s (duration=%ss)",
                        video.user_id,
                        duration_seconds,
                        exc_info=True,
                    )
