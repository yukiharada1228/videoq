"""
Main transcription task using Celery
"""

import logging
import os
import tempfile

from celery import shared_task
from django.conf import settings
from django.db import transaction

from app.tasks.audio_processing import extract_and_split_audio
from app.tasks.srt_processing import (apply_scene_splitting,
                                      transcribe_and_create_srt)
from app.tasks.vector_indexing import index_scenes_batch
from app.utils.task_helpers import (ErrorHandler, TemporaryFileManager,
                                    VideoTaskManager)
from app.utils.whisper_client import (WhisperConfig, create_whisper_client,
                                      get_whisper_model_name)

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


def cleanup_external_upload(video_file, video_id):
    """
    Delete original video file after processing when external_id is specified.
    Also clears the DB field so the frontend doesn't try to preview a missing file.
    """
    try:
        if video_file:
            # Delete actual file object from storage
            video_file.delete(save=False)
            logger.info(
                f"Deleted original video file after processing (video ID: {video_id})"
            )
    except Exception as e:
        logger.warning(
            f"Failed to delete video file after processing (video ID: {video_id}): {e}"
        )


@transaction.atomic
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
            should_delete_original_video = bool(video.external_id)

            is_valid, validation_error = VideoTaskManager.validate_video_for_processing(
                video
            )
            if not is_valid:
                raise ValueError(validation_error)

            VideoTaskManager.update_video_status(video, "processing")

            # Get OpenAI API key from environment variable
            api_key = settings.OPENAI_API_KEY

            # Initialize Whisper client (OpenAI API or local whisper.cpp server)
            whisper_config = WhisperConfig()
            client = create_whisper_client(api_key, whisper_config)
            whisper_model = get_whisper_model_name(whisper_config)
            logger.info(
                f"Using Whisper backend: {whisper_config.backend}, model: {whisper_model}"
            )

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

            srt_content = transcribe_and_create_srt(
                client, audio_segments, whisper_model
            )
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

            # Cleanup original video file if this is an external_id-based upload
            if should_delete_original_video:
                cleanup_external_upload(video_file, video_id)
                # Persist clearing the file field so API won't return a broken URL
                try:
                    video.file = ""
                    video.save(update_fields=["file"])
                except Exception as e:
                    logger.warning(
                        f"Failed to clear video.file after deletion (video ID: {video_id}): {e}"
                    )

            return scene_split_srt

        except Exception as e:
            ErrorHandler.handle_task_error(e, video_id, self, max_retries=3)
