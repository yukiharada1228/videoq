"""
Main transcription task using Celery
"""

import json
import logging
import os
import subprocess
import tempfile

from celery import shared_task
from django.conf import settings
from openai import OpenAI

from app.tasks.audio_processing import extract_and_split_audio
from app.tasks.srt_processing import apply_scene_splitting, transcribe_and_create_srt
from app.tasks.vector_indexing import index_scenes_batch
from app.utils.task_helpers import ErrorHandler, TemporaryFileManager, VideoTaskManager

logger = logging.getLogger(__name__)


def download_video_from_storage(video, video_id, temp_manager):
    """
    Download video from remote storage (S3) to local temporary file
    Returns: (video_file_path, video_file)
    """
    video_file = video.file

    # Try to get local file path
    try:
        return video.file.path, video_file
    except (NotImplementedError, AttributeError):
        # Remote storage like S3 - download to temporary file
        temp_video_path = os.path.join(
            tempfile.gettempdir(),
            f"video_{video_id}_{os.path.basename(video_file.name)}",
        )
        logger.info(f"Downloading video from S3 to {temp_video_path}")

        with video_file.open("rb") as remote_file:
            with open(temp_video_path, "wb") as local_file:
                local_file.write(remote_file.read())

        temp_manager.temp_files.append(temp_video_path)
        logger.info(f"Video downloaded successfully to {temp_video_path}")
        return temp_video_path, video_file


def save_video_duration(video, video_file_path):
    """
    Get video duration from ffprobe and save to Video model
    """
    if video.duration_minutes is not None:
        return

    try:
        probe_result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                video_file_path,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        probe = json.loads(probe_result.stdout)
        duration_seconds = float(probe["format"]["duration"])
        duration_minutes = duration_seconds / 60.0
        video.duration_minutes = duration_minutes
        video.save(update_fields=["duration_minutes"])
        logger.info(f"Saved video duration: {duration_minutes:.2f} minutes")
    except Exception as e:
        logger.warning(f"Failed to save video duration: {e}")


def cleanup_external_upload(video_file, video_id):
    """
    Delete video file after processing for external API uploads
    """
    try:
        if video_file:
            video_file.delete(save=False)
            logger.info(
                f"Deleted video file for external upload (video ID: {video_id})"
            )
    except Exception as e:
        logger.warning(
            f"Failed to delete video file for external upload (video ID: {video_id}): {e}"
        )


def save_transcription_result(video, scene_split_srt):
    """
    Save transcription result
    """
    VideoTaskManager.update_video_status(video, "completed", "")
    video.transcript = scene_split_srt
    video.save(update_fields=["transcript"])


def handle_transcription_error(video, error_msg):
    """
    Common error handling for transcription errors
    """
    logger.error(error_msg)
    VideoTaskManager.update_video_status(video, "error", error_msg)


@shared_task(bind=True, max_retries=3)
def transcribe_video(self, video_id):
    """
    Execute video transcription using Whisper API
    Automatically converts to MP3 using ffmpeg if conversion is needed

    Args:
        video_id: ID of the Video instance to transcribe

    Returns:
        str: Transcribed text
    """
    logger.info(f"Transcription task started for video ID: {video_id}")

    with TemporaryFileManager() as temp_manager:
        try:
            # Validate and prepare video
            video, error = VideoTaskManager.get_video_with_user(video_id)
            if error:
                raise Exception(error)

            logger.info(f"Video found: {video.title}")
            is_external_upload = video.is_external_upload

            is_valid, validation_error = VideoTaskManager.validate_video_for_processing(
                video
            )
            if not is_valid:
                raise ValueError(validation_error)

            VideoTaskManager.update_video_status(video, "processing")

            # Initialize OpenAI client
            api_key = settings.OPENAI_API_KEY
            if not api_key:
                raise ValueError("OpenAI API key is not configured")
            client = OpenAI(api_key=api_key)

            # Download video from storage (S3 or local)
            video_file_path, video_file = download_video_from_storage(
                video, video_id, temp_manager
            )
            logger.info(f"Starting transcription for video {video_id}")

            # Extract audio and transcribe
            audio_segments = extract_and_split_audio(
                video_file_path, temp_manager=temp_manager
            )
            if not audio_segments:
                handle_transcription_error(video, "Failed to extract audio from video")
                return

            save_video_duration(video, video_file_path)

            srt_content = transcribe_and_create_srt(client, audio_segments)
            if not srt_content:
                handle_transcription_error(
                    video, "Failed to transcribe any audio segments"
                )
                return

            # Apply scene splitting and save
            logger.info("Applying scene splitting...")
            scene_split_srt, _ = apply_scene_splitting(
                srt_content, api_key, len(audio_segments)
            )
            save_transcription_result(video, scene_split_srt)

            # Index scenes for RAG
            index_scenes_batch(scene_split_srt, video, api_key)

            logger.info(f"Successfully processed video {video_id}")

            # Cleanup external uploads
            if is_external_upload:
                cleanup_external_upload(video_file, video_id)

            return scene_split_srt

        except Exception as e:
            ErrorHandler.handle_task_error(e, video_id, self, max_retries=3)
