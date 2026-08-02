"""transcribe_video — transcription pipeline without Django."""

from __future__ import annotations

import logging
import os

from worker_python.db import db_connection
from worker_python.video_sql import get_video_for_task, save_transcript, transition_video_status
from worker_python.video_status import (
    plan_transcription_failure,
    plan_transcription_start,
    plan_transcription_success,
)

logger = logging.getLogger(__name__)

_HEAVY_PIPELINE = os.environ.get("ENABLE_HEAVY_PIPELINE", "").lower() in {
    "1",
    "true",
    "yes",
}


class TranscriptionTargetMissingError(Exception):
    pass


class TranscriptionExecutionFailedError(Exception):
    pass


class TranscriptionRejectedError(Exception):
    pass


class FileSizeExceededError(Exception):
    pass


def _run_transcription_pipeline(video) -> str:
    """
    Run FFmpeg + Whisper (uploaded) or YouTube transcript fetch.

    When ENABLE_HEAVY_PIPELINE is unset, returns a minimal SRT placeholder so
    status transitions and downstream indexing can be tested without GPU deps.
    """
    if not _HEAVY_PIPELINE:
        logger.info(
            "ENABLE_HEAVY_PIPELINE is off; using placeholder transcript for video %d",
            video.id,
        )
        return (
            "1\n"
            "00:00:00,000 --> 00:00:01,000\n"
            "[placeholder transcript — enable ENABLE_HEAVY_PIPELINE for real transcription]\n"
        )

    if video.source_type == "youtube":
        if not video.youtube_video_id:
            raise RuntimeError("youtube_video_id is required for YouTube transcription.")
        # TODO: wire SearchAPI / youtube transcript gateway (see backend use case).
        raise NotImplementedError(
            "YouTube transcription requires SearchAPI gateway wiring in worker-python."
        )

    if not video.file_key:
        raise RuntimeError(f"Video {video.id} has no file key for uploaded transcription.")

    # TODO: copy/adapt backend transcription gateway (ffmpeg extract + whisper).
    raise NotImplementedError(
        "Uploaded video transcription requires FFmpeg/Whisper pipeline wiring "
        "(set ENABLE_HEAVY_PIPELINE=1 after packaging deps)."
    )


def transcribe_video(video_id: int) -> None:
    """
    Transcribe a video and transition status to INDEXING on success.

    Matches Celery task error semantics:
    - TranscriptionTargetMissingError / TranscriptionExecutionFailedError: re-raise
    - FileSizeExceededError / TranscriptionRejectedError: log and swallow
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
        transcript = _run_transcription_pipeline(video)

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
        if isinstance(exc, TranscriptionRejectedError):
            raise
        raise TranscriptionExecutionFailedError(
            f"Transcription failed for video {video_id}: {error_msg}"
        ) from exc

    logger.info(
        "Transcription completed for video %d; enqueue indexing separately", video_id
    )
