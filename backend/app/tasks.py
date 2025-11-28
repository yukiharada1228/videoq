"""
Celery tasks - Whisper transcription processing
"""

import json
import logging
import os
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor

from celery import shared_task
from django.conf import settings
from langchain_openai import OpenAIEmbeddings
from langchain_postgres import PGVector
from openai import OpenAI

from app.utils.task_helpers import (ErrorHandler, TemporaryFileManager,
                                    VideoTaskManager)
from app.utils.vector_manager import PGVectorManager

from .scene_otsu import SceneSplitter, SubtitleParser

logger = logging.getLogger(__name__)

# Formats supported by Whisper API
SUPPORTED_FORMATS = {
    ".flac",
    ".m4a",
    ".mp3",
    ".mp4",
    ".mpeg",
    ".mpga",
    ".oga",
    ".ogg",
    ".wav",
    ".webm",
}


def format_time_for_srt(seconds):
    """
    Convert seconds to SRT time format (HH:MM:SS,mmm)
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    whole_secs = int(secs)
    millis = int((secs - whole_secs) * 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_secs:02d},{millis:03d}"


def create_srt_content(segments):
    """
    Create SRT subtitle content from segments
    """
    srt_lines = []
    for i, segment in enumerate(segments, 1):
        start_time = format_time_for_srt(segment["start"])
        end_time = format_time_for_srt(segment["end"])
        text = segment["text"].strip()

        # Format as SRT
        srt_lines.append(f"{i}")
        srt_lines.append(f"{start_time} --> {end_time}")
        srt_lines.append(text)
        srt_lines.append("")  # Separate with empty line

    return "\n".join(srt_lines)


def _count_scenes(srt_content):
    """
    Count the number of scenes in an SRT file
    """
    return len(
        [
            line
            for line in srt_content.split("\n")
            if line.strip() and line.strip().isdigit()
        ]
    )


def _parse_srt_scenes(srt_content):
    return SubtitleParser.parse_srt_scenes(srt_content)


def _index_scenes_to_vectorstore(scene_docs, video, api_key=None):
    """
    Create vector index using LangChain + pgvector
    scene_docs: [{text, metadata}]
    """
    try:
        # Use system OpenAI API key from environment variable if not provided
        if api_key is None:
            api_key = settings.OPENAI_API_KEY
            if not api_key:
                raise ValueError("OpenAI API key is not configured")
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small", api_key=api_key)
        config = PGVectorManager.get_config()

        valid_docs = [d for d in scene_docs if d.get("text")]
        texts = [d["text"] for d in valid_docs]
        metadatas = [d.get("metadata", {}) for d in valid_docs]

        if not texts:
            logger.info("No valid texts to index, skipping pgvector indexing")
            return

        logger.info(
            f"Indexing {len(texts)} scenes to pgvector collection: {config['collection_name']}"
        )

        # Create vector store with pgvector
        # langchain_postgres uses psycopg3, so convert connection string
        # postgresql:// → postgresql+psycopg://
        connection_str = config["database_url"]
        if connection_str.startswith("postgresql://"):
            connection_str = connection_str.replace(
                "postgresql://", "postgresql+psycopg://", 1
            )

        PGVector.from_texts(
            texts=texts,
            embedding=embeddings,
            collection_name=config["collection_name"],
            connection=connection_str,  # langchain_postgres uses connection parameter (psycopg3 format)
            metadatas=metadatas,
            use_jsonb=True,  # Enable JSONB filtering
        )

        logger.info(f"Successfully indexed {len(texts)} scenes to pgvector")

    except Exception as e:
        logger.warning(f"Indexing to pgvector failed: {e}", exc_info=True)


def _get_video_duration(input_path):
    """
    Get video duration using ffprobe
    Returns: duration in seconds
    """
    probe_result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            input_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    probe = json.loads(probe_result.stdout)
    duration = float(probe["format"]["duration"])
    logger.info(f"Video duration: {duration:.2f} seconds")
    return duration


def _extract_full_audio(input_path, temp_dir):
    """
    Extract full audio from video as MP3
    Returns: (audio_path, audio_size_mb)
    """
    temp_audio_path = os.path.join(
        temp_dir, f"temp_audio_{os.path.basename(input_path)}.mp3"
    )

    subprocess.run(
        [
            "ffmpeg",
            "-i",
            input_path,
            "-acodec",
            "mp3",
            "-ab",
            "128k",
            "-y",
            temp_audio_path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    audio_size_mb = os.path.getsize(temp_audio_path) / (1024 * 1024)
    logger.debug(f"Extracted audio size: {audio_size_mb:.2f} MB")
    return temp_audio_path, audio_size_mb


def _extract_audio_segment(input_path, start_time, end_time, segment_index, temp_dir):
    """
    Extract a specific audio segment from video
    Returns: audio segment info dict
    """
    segment_duration = end_time - start_time
    audio_path = os.path.join(
        temp_dir, f"audio_segment_{segment_index}_{os.path.basename(input_path)}.mp3"
    )

    subprocess.run(
        [
            "ffmpeg",
            "-i",
            input_path,
            "-ss",
            str(start_time),
            "-t",
            str(segment_duration),
            "-acodec",
            "mp3",
            "-ab",
            "128k",
            "-y",
            audio_path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    return {"path": audio_path, "start_time": start_time, "end_time": end_time}


def _split_audio_into_segments(
    input_path, duration, audio_size_mb, max_size_mb, temp_dir
):
    """
    Split audio into multiple segments based on size
    Returns: list of audio segment info dicts
    """
    safe_size_mb = max_size_mb * 0.8  # 20% margin
    num_segments = int(audio_size_mb / safe_size_mb) + 1
    segment_duration = duration / num_segments

    logger.info(
        f"Splitting into {num_segments} segments of ~{segment_duration:.2f} seconds each"
    )

    audio_segments = []
    for i in range(num_segments):
        start_time = i * segment_duration
        end_time = min((i + 1) * segment_duration, duration)
        segment = _extract_audio_segment(input_path, start_time, end_time, i, temp_dir)
        audio_segments.append(segment)

    return audio_segments


def extract_and_split_audio(input_path, max_size_mb=24, temp_manager=None):
    """
    Extract audio from video and split appropriately based on file size
    max_size_mb: Maximum size of each segment (MB)
    temp_manager: TemporaryFileManager instance for cleanup
    """
    try:
        duration = _get_video_duration(input_path)
        temp_dir = tempfile.gettempdir()

        # Extract audio and check size
        temp_audio_path, audio_size_mb = _extract_full_audio(input_path, temp_dir)

        if audio_size_mb <= max_size_mb:
            # No splitting needed
            audio_segments = [
                {"path": temp_audio_path, "start_time": 0, "end_time": duration}
            ]
            logger.debug("Audio is within size limit, no splitting needed")
        else:
            # Split into segments
            os.remove(temp_audio_path)
            audio_segments = _split_audio_into_segments(
                input_path, duration, audio_size_mb, max_size_mb, temp_dir
            )

        # Register temporary files for cleanup
        if temp_manager:
            for segment in audio_segments:
                temp_manager.temp_files.append(segment["path"])

        return audio_segments

    except subprocess.CalledProcessError as e:
        logger.error(f"Error running ffmpeg/ffprobe: {e.stderr}")
        return []
    except Exception as e:
        logger.error(f"Error extracting/splitting audio: {e}")
        return []


def transcribe_audio_segment(client, segment_info):
    """
    Transcribe a single audio segment
    """
    try:
        with open(segment_info["path"], "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        return transcription, None
    except Exception as e:
        logger.error(f"Error transcribing segment: {e}")
        return None, e


def _process_audio_segments_parallel(client, audio_segments):
    """
    Process audio segments in parallel
    """
    all_segments = []

    # Use ThreadPoolExecutor for parallel processing
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = []
        for i, segment_info in enumerate(audio_segments):
            future = executor.submit(transcribe_audio_segment, client, segment_info)
            futures.append((i, segment_info, future))

        for i, segment_info, future in futures:
            transcription, error = future.result()

            if error:
                logger.error(f"Error in segment {i}: {error}")
                continue

            # Adjust timestamps for each segment
            for whisper_segment in transcription.segments:
                # Adjust to original video time
                adjusted_start = whisper_segment.start + segment_info["start_time"]
                adjusted_end = whisper_segment.end + segment_info["start_time"]

                all_segments.append(
                    {
                        "start": adjusted_start,
                        "end": adjusted_end,
                        "text": whisper_segment.text,
                    }
                )

    return all_segments


def _apply_scene_splitting(srt_content, api_key=None, original_segment_count=None):
    """
    Apply scene splitting
    """
    try:
        # Use system OpenAI API key from environment variable if not provided
        if api_key is None:
            api_key = settings.OPENAI_API_KEY
            if not api_key:
                raise ValueError("OpenAI API key is not configured")
        splitter = SceneSplitter(api_key=api_key)
        scene_split_srt = splitter.process(srt_content, max_tokens=512)
        scene_count = _count_scenes(scene_split_srt)
        logger.info(
            f"Scene splitting completed. Original: {original_segment_count} segments, Scenes: {scene_count} scenes"
        )
        return scene_split_srt, scene_count
    except Exception as e:
        logger.warning(f"Scene splitting failed: {e}. Using original SRT content.")
        return srt_content, original_segment_count


def _save_transcription_result(video, scene_split_srt):
    """
    Save transcription result
    """
    VideoTaskManager.update_video_status(video, "completed", "")
    video.transcript = scene_split_srt
    video.save(update_fields=["transcript"])


def _handle_transcription_error(video, error_msg):
    """
    Common error handling for transcription errors
    """
    logger.error(error_msg)
    VideoTaskManager.update_video_status(video, "error", error_msg)


def _index_scenes_batch(scene_split_srt, video, api_key=None):
    """
    Batch index scenes to pgvector
    """
    try:
        # Use system OpenAI API key from environment variable if not provided
        if api_key is None:
            api_key = settings.OPENAI_API_KEY
            if not api_key:
                raise ValueError("OpenAI API key is not configured")
        logger.info("Starting scene indexing to pgvector...")
        scenes = _parse_srt_scenes(scene_split_srt)
        logger.info(f"Parsed {len(scenes)} scenes from SRT")

        scene_docs = [
            {
                "text": sc["text"],
                "metadata": _create_scene_metadata(video, sc),
            }
            for sc in scenes
        ]

        logger.info(f"Prepared {len(scene_docs)} scene documents for indexing")
        _index_scenes_to_vectorstore(scene_docs, video, api_key)

    except Exception as e:
        logger.warning(f"Failed to prepare scenes for indexing: {e}", exc_info=True)


def _create_scene_metadata(video, scene):
    """
    Create scene metadata
    """
    return {
        "video_id": video.id,
        "user_id": video.user_id,
        "video_title": video.title,
        "start_time": scene["start_time"],
        "end_time": scene["end_time"],
        "start_sec": scene["start_sec"],
        "end_sec": scene["end_sec"],
        "scene_index": scene["index"],
    }


def _download_video_from_storage(video, video_id, temp_manager):
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


def _save_video_duration(video, video_file_path):
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


def _cleanup_external_upload(video_file, video_id):
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


def _transcribe_and_create_srt(client, audio_segments):
    """
    Transcribe audio segments and create SRT content
    Returns: srt_content or None if failed
    """
    all_segments = _process_audio_segments_parallel(client, audio_segments)

    if not all_segments:
        return None

    return create_srt_content(all_segments)


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
            video_file_path, video_file = _download_video_from_storage(
                video, video_id, temp_manager
            )
            logger.info(f"Starting transcription for video {video_id}")

            # Extract audio and transcribe
            audio_segments = extract_and_split_audio(
                video_file_path, temp_manager=temp_manager
            )
            if not audio_segments:
                _handle_transcription_error(video, "Failed to extract audio from video")
                return

            _save_video_duration(video, video_file_path)

            srt_content = _transcribe_and_create_srt(client, audio_segments)
            if not srt_content:
                _handle_transcription_error(
                    video, "Failed to transcribe any audio segments"
                )
                return

            # Apply scene splitting and save
            logger.info("Applying scene splitting...")
            scene_split_srt, _ = _apply_scene_splitting(
                srt_content, api_key, len(audio_segments)
            )
            _save_transcription_result(video, scene_split_srt)

            # Index scenes for RAG
            _index_scenes_batch(scene_split_srt, video, api_key)

            logger.info(f"Successfully processed video {video_id}")

            # Cleanup external uploads
            if is_external_upload:
                _cleanup_external_upload(video_file, video_id)

            return scene_split_srt

        except Exception as e:
            ErrorHandler.handle_task_error(e, video_id, self, max_retries=3)
