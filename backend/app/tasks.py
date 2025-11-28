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


def extract_and_split_audio(input_path, max_size_mb=24, temp_manager=None):
    """
    Extract audio from video and split appropriately based on file size
    max_size_mb: Maximum size of each segment (MB)
    temp_manager: TemporaryFileManager instance for cleanup
    """
    try:
        # Get video information using ffprobe
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

        # Create temporary directory
        temp_dir = tempfile.gettempdir()
        audio_segments = []

        # First extract entire audio and check size
        temp_audio_path = os.path.join(
            temp_dir, f"temp_audio_{os.path.basename(input_path)}.mp3"
        )

        # Extract audio using ffmpeg
        subprocess.run(
            [
                "ffmpeg",
                "-i",
                input_path,
                "-acodec",
                "mp3",
                "-ab",
                "128k",
                "-y",  # overwrite output
                temp_audio_path,
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        # Check audio file size
        audio_size_mb = os.path.getsize(temp_audio_path) / (1024 * 1024)
        logger.debug(f"Extracted audio size: {audio_size_mb:.2f} MB")

        if audio_size_mb <= max_size_mb:
            # No splitting needed if size is within limit
            audio_segments.append(
                {"path": temp_audio_path, "start_time": 0, "end_time": duration}
            )
            logger.debug("Audio is within size limit, no splitting needed")

        else:
            # Splitting needed if size is large
            # Delete audio file and split video by time
            os.remove(temp_audio_path)

            # Calculate number of segments (with some margin)
            safe_size_mb = max_size_mb * 0.8  # 20% margin
            num_segments = int(audio_size_mb / safe_size_mb) + 1
            segment_duration = duration / num_segments

            logger.info(
                f"Splitting into {num_segments} segments of ~{segment_duration:.2f} seconds each"
            )

            for i in range(num_segments):
                start_time = i * segment_duration
                end_time = min((i + 1) * segment_duration, duration)
                segment_duration_actual = end_time - start_time

                audio_path = os.path.join(
                    temp_dir, f"audio_segment_{i}_{os.path.basename(input_path)}.mp3"
                )

                # Extract audio segment using ffmpeg
                subprocess.run(
                    [
                        "ffmpeg",
                        "-i",
                        input_path,
                        "-ss",
                        str(start_time),
                        "-t",
                        str(segment_duration_actual),
                        "-acodec",
                        "mp3",
                        "-ab",
                        "128k",
                        "-y",  # overwrite output
                        audio_path,
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )

                audio_segments.append(
                    {"path": audio_path, "start_time": start_time, "end_time": end_time}
                )

        # Register temporary files for cleanup if manager is provided
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

    # Initialize temporary file management
    with TemporaryFileManager() as temp_manager:
        try:
            video, error = VideoTaskManager.get_video_with_user(video_id)
            if error:
                raise Exception(error)

            logger.info(f"Video found: {video.title}")

            # Keep track of whether this is an upload from external API client
            is_external_upload = video.is_external_upload

            # Validate video processability
            is_valid, validation_error = VideoTaskManager.validate_video_for_processing(
                video
            )
            if not is_valid:
                raise ValueError(validation_error)

            # Update status to processing
            VideoTaskManager.update_video_status(video, "processing")

            # Use system OpenAI API key from environment variable
            api_key = settings.OPENAI_API_KEY
            if not api_key:
                raise ValueError("OpenAI API key is not configured")

            # Initialize OpenAI client
            client = OpenAI(api_key=api_key)

            # Process video file (S3 support)
            video_file = video.file  # Also keep file object

            # Download temporarily to local if S3
            try:
                # Local filesystem case
                video_file_path = video.file.path
            except (NotImplementedError, AttributeError):
                # Remote storage like S3 case
                # Download to temporary file
                temp_video_path = os.path.join(
                    tempfile.gettempdir(),
                    f"video_{video_id}_{os.path.basename(video_file.name)}",
                )
                logger.info(f"Downloading video from S3 to {temp_video_path}")

                # Download file from S3
                with video_file.open("rb") as remote_file:
                    with open(temp_video_path, "wb") as local_file:
                        local_file.write(remote_file.read())

                video_file_path = temp_video_path
                # Register as temporary file (to be deleted after processing)
                temp_manager.temp_files.append(temp_video_path)
                logger.info(f"Video downloaded successfully to {temp_video_path}")

            logger.info(f"Starting transcription for video {video_id}")

            # Extract and split audio (with temporary file management)
            audio_segments = extract_and_split_audio(
                video_file_path, temp_manager=temp_manager
            )

            if not audio_segments:
                _handle_transcription_error(video, "Failed to extract audio from video")
                return

            # Get video duration and save to Video model if not already set
            if video.duration_minutes is None:
                try:
                    # Get video duration from ffprobe (already done in extract_and_split_audio)
                    # We need to get it again or extract from the audio_segments
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

            # Process segments in parallel for better performance
            all_segments = _process_audio_segments_parallel(client, audio_segments)

            if not all_segments:
                _handle_transcription_error(
                    video, "Failed to transcribe any audio segments"
                )
                return

            # Create SRT content
            srt_content = create_srt_content(all_segments)

            # Apply scene splitting using SceneSplitter
            logger.info("Applying scene splitting...")
            scene_split_srt, scene_count = _apply_scene_splitting(
                srt_content, api_key, len(all_segments)
            )

            # Save processed SRT
            _save_transcription_result(video, scene_split_srt)

            # Index scenes to vector store for RAG
            _index_scenes_batch(scene_split_srt, video, api_key)

            logger.info(f"Successfully processed video {video_id}")

            # Delete file after processing if uploaded from external API client
            if is_external_upload:
                try:
                    # Delete file
                    if video_file:
                        video_file.delete(save=False)
                        logger.info(
                            f"Deleted video file for external upload (video ID: {video_id})"
                        )
                except Exception as e:
                    logger.warning(
                        f"Failed to delete video file for external upload (video ID: {video_id}): {e}"
                    )

            return scene_split_srt

        except Exception as e:
            # Common error handling
            ErrorHandler.handle_task_error(e, video_id, self, max_retries=3)
