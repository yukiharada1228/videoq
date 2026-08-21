"""transcribe_video — VideoQ transcription pipeline."""

from __future__ import annotations

import logging

from worker_python.contracts import JOB_INDEX_VIDEO_TRANSCRIPT
from worker_python.db import db_connection
from worker_python.pipeline.transcription import run_transcription
from worker_python.pipeline.user_secret_envelope import try_decrypt
from worker_python.sqs_enqueue import enqueue_job
from worker_python.tasks.indexing import index_video_transcript
from worker_python.video_sql import get_video_for_task, save_transcript, transition_video_status
from worker_python.video_status import (
    plan_transcription_failure,
    plan_transcription_start,
    plan_transcription_success,
)

logger = logging.getLogger(__name__)


class TranscriptionTargetMissingError(Exception):
    pass


class TranscriptionExecutionFailedError(Exception):
    pass


class TranscriptionRejectedError(Exception):
    pass


class FileSizeExceededError(Exception):
    pass


def _load_searchapi_key(user_id: str) -> str | None:
    from worker_python.env import env_str

    override = env_str("SEARCHAPI_API_KEY")
    if override:
        return override
    with db_connection() as conn:
        row = conn.execute(
            "SELECT searchapi_api_key_encrypted FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return try_decrypt(row.get("searchapi_api_key_encrypted"))


def _enqueue_or_run_indexing(video_id: int) -> None:
    message_id = enqueue_job(JOB_INDEX_VIDEO_TRANSCRIPT, {"video_id": video_id})
    if message_id:
        return
    logger.info("SQS unavailable; running indexing inline for video %d", video_id)
    index_video_transcript(video_id)


def transcribe_video(video_id: int) -> None:
    """
    Transcribe a video and transition status to INDEXING on success,
    then enqueue (or inline-run) indexing.
    """
    logger.info("Transcription task started for video ID: %d", video_id)

    with db_connection() as conn:
        video = get_video_for_task(conn, video_id)

    if video is None:
        logger.warning("Transcription target video not found: %d", video_id)
        raise TranscriptionTargetMissingError(f"Video {video_id} not found")

    from_status, to_status = plan_transcription_start(video.status)

    try:
        with db_connection() as conn:
            if not transition_video_status(conn, video_id, from_status, to_status):
                raise TranscriptionExecutionFailedError(
                    f"Video {video_id} could not transition {from_status.value} → {to_status.value}"
                )
            conn.commit()

        logger.info("Transcription started for video %d (%s)", video.id, video.title)
        searchapi_key = (
            _load_searchapi_key(video.user_id) if video.source_type == "youtube" else None
        )
        transcript = run_transcription(video, searchapi_key=searchapi_key)

        success_from, success_to = plan_transcription_success()
        with db_connection() as conn:
            save_transcript(conn, video_id, transcript)
            transition_video_status(conn, video_id, success_from, success_to)
            conn.commit()

    except FileSizeExceededError:
        logger.warning("File size exceeded for video %d, no retry", video_id)
        return
    except TranscriptionRejectedError as exc:
        logger.warning("Transcription rejected for video %d, no retry: %s", video_id, exc)
        return
    except (
        TranscriptionTargetMissingError,
        TranscriptionExecutionFailedError,
        TranscriptionRejectedError,
        FileSizeExceededError,
    ):
        raise
    except Exception as exc:
        error_msg = str(exc)
        logger.error("Transcription failed for video %d: %s", video_id, error_msg)
        fail_from, fail_to = plan_transcription_failure()
        with db_connection() as conn:
            transition_video_status(
                conn, video_id, fail_from, fail_to, error_message=error_msg
            )
            conn.commit()
        raise TranscriptionExecutionFailedError(
            f"Transcription failed for video {video_id}: {error_msg}"
        ) from exc

    logger.info("Transcription completed for video %d; enqueue indexing", video_id)
    try:
        _enqueue_or_run_indexing(video_id)
    except Exception:
        logger.exception(
            "Indexing after transcription failed for video %d (status left INDEXING)",
            video_id,
        )
        raise
