"""
Audio extraction and processing utilities
"""

import asyncio
import json
import logging
import os
import platform
import subprocess
import tempfile
from types import ModuleType

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from openai import AsyncOpenAI

try:
    import resource as resource_module
except ImportError:  # pragma: no cover - non-Unix fallback
    resource_module: ModuleType | None = None

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

ALLOWED_VIDEO_CONTAINER_FORMATS = {
    "3gp",
    "3g2",
    "avi",
    "matroska",
    "mov",
    "mp4",
    "mpeg",
    "webm",
}

ALLOWED_VIDEO_CODECS = {
    "av1",
    "h263",
    "h264",
    "hevc",
    "mpeg4",
    "msmpeg4v3",
    "vp8",
    "vp9",
}


class InvalidMediaFileError(ValueError):
    """Raised when an uploaded file cannot be verified as a supported video."""


def _get_setting(name, default):
    try:
        return getattr(settings, name, default)
    except ImproperlyConfigured:
        return default


def _build_media_preexec_fn():
    """
    Apply conservative resource limits to ffmpeg/ffprobe child processes on Unix.
    """
    if platform.system() == "Windows" or resource_module is None:
        return None

    cpu_time_limit_seconds = int(
        _get_setting("MEDIA_PROCESS_CPU_TIME_LIMIT_SECONDS", 30)
    )
    memory_limit_mb = int(_get_setting("MEDIA_PROCESS_MEMORY_LIMIT_MB", 1024))
    output_file_size_limit_mb = int(
        _get_setting("MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB", 512)
    )

    def _set_limits():
        if cpu_time_limit_seconds > 0:
            resource_module.setrlimit(
                resource_module.RLIMIT_CPU,
                (cpu_time_limit_seconds, cpu_time_limit_seconds),
            )
        if memory_limit_mb > 0:
            memory_limit_bytes = memory_limit_mb * 1024 * 1024
            resource_module.setrlimit(
                resource_module.RLIMIT_AS,
                (memory_limit_bytes, memory_limit_bytes),
            )
        if output_file_size_limit_mb > 0:
            output_file_limit_bytes = output_file_size_limit_mb * 1024 * 1024
            resource_module.setrlimit(
                resource_module.RLIMIT_FSIZE,
                (output_file_limit_bytes, output_file_limit_bytes),
            )

    return _set_limits


def _run_media_command(command, timeout_seconds):
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=True,
        timeout=timeout_seconds,
        preexec_fn=_build_media_preexec_fn(),
    )


def probe_media_file(input_path, timeout_seconds=10):
    """
    Inspect a media file with ffprobe and return parsed metadata.
    """
    try:
        probe_result = _run_media_command(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                input_path,
            ],
            timeout_seconds,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
        raise InvalidMediaFileError("Uploaded file could not be validated as a video.") from exc

    try:
        return json.loads(probe_result.stdout)
    except json.JSONDecodeError as exc:
        raise InvalidMediaFileError("Uploaded file could not be validated as a video.") from exc


def validate_video_media_file(
    input_path,
    allowed_container_formats=None,
    timeout_seconds=10,
):
    """
    Validate that a file is a supported video container with at least one video stream.
    """
    probe = probe_media_file(input_path, timeout_seconds=timeout_seconds)
    streams = probe.get("streams") or []
    format_info = probe.get("format") or {}

    video_streams = [
        stream for stream in streams if stream.get("codec_type") == "video"
    ]
    if not video_streams:
        raise InvalidMediaFileError("Uploaded file is not a valid video.")

    codec_names = {stream.get("codec_name") for stream in video_streams}
    if not all(codec_names):
        raise InvalidMediaFileError("Uploaded file is missing video codec metadata.")
    if not codec_names.issubset(ALLOWED_VIDEO_CODECS):
        raise InvalidMediaFileError("Uploaded video codec is not supported.")

    format_names = {
        name.strip()
        for name in (format_info.get("format_name") or "").split(",")
        if name.strip()
    }
    allowed_formats = set(allowed_container_formats or ALLOWED_VIDEO_CONTAINER_FORMATS)
    if not format_names or format_names.isdisjoint(allowed_formats):
        raise InvalidMediaFileError("Uploaded video container is not supported.")

    duration_raw = format_info.get("duration")
    try:
        duration = float(duration_raw)
    except (TypeError, ValueError) as exc:
        raise InvalidMediaFileError("Uploaded file is missing a valid duration.") from exc

    if duration <= 0:
        raise InvalidMediaFileError("Uploaded file duration must be greater than zero.")

    return probe


def _get_video_duration(input_path):
    """
    Get video duration using ffprobe
    Returns: duration in seconds
    """
    probe = probe_media_file(input_path)
    duration = float(probe["format"]["duration"])
    logger.info(f"Video duration: {duration:.2f} seconds")
    return duration


def _extract_full_audio(input_path, temp_dir):
    """
    Extract the full audio track from a video file and save it as an MP3 in a temporary directory.

    Parameters:
        input_path (str): Path to the source video file.
        temp_dir (str): Directory where the extracted MP3 will be written.

    Returns:
        tuple: (audio_path, audio_size_mb) where `audio_path` is the filesystem path to the extracted MP3 and `audio_size_mb` is the file size in megabytes.

    Raises:
        subprocess.CalledProcessError: If ffmpeg fails to extract audio.
    """
    temp_audio_path = os.path.join(
        temp_dir, f"temp_audio_{os.path.basename(input_path)}.mp3"
    )

    _run_media_command(
        [
            "ffmpeg",
            "-i",
            input_path,
            "-vn",
            "-acodec",
            "mp3",
            "-ab",
            "128k",
            "-y",
            temp_audio_path,
        ],
        int(_get_setting("FFMPEG_PROCESS_TIMEOUT_SECONDS", 120)),
    )

    audio_size_mb = os.path.getsize(temp_audio_path) / (1024 * 1024)
    logger.debug(f"Extracted audio size: {audio_size_mb:.2f} MB")
    return temp_audio_path, audio_size_mb


def _extract_audio_segment(input_path, start_time, end_time, segment_index, temp_dir):
    """
    Extracts an MP3 audio segment from a media file and writes it to the specified temporary directory.

    Parameters:
        input_path (str): Path to the source media file.
        start_time (float): Segment start time in seconds.
        end_time (float): Segment end time in seconds.
        segment_index (int): Index used to construct the output filename.
        temp_dir (str): Directory where the extracted segment will be written.

    Returns:
        dict: Information about the extracted segment with keys:
            - "path" (str): Full path to the extracted MP3 file.
            - "start_time" (float): The segment's start time (seconds).
            - "end_time" (float): The segment's end time (seconds).

    Raises:
        subprocess.CalledProcessError: If the ffmpeg command fails.
    """
    segment_duration = end_time - start_time
    audio_path = os.path.join(
        temp_dir, f"audio_segment_{segment_index}_{os.path.basename(input_path)}.mp3"
    )

    _run_media_command(
        [
            "ffmpeg",
            "-ss",
            str(start_time),
            "-i",
            input_path,
            "-t",
            str(segment_duration),
            "-vn",
            "-acodec",
            "mp3",
            "-ab",
            "128k",
            "-y",
            audio_path,
        ],
        int(_get_setting("FFMPEG_PROCESS_TIMEOUT_SECONDS", 120)),
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

    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        stderr = getattr(e, "stderr", None) or str(e)
        logger.error(f"Error running ffmpeg/ffprobe: {stderr}")
        return []
    except Exception as e:
        logger.error(f"Error extracting/splitting audio: {e}")
        return []


async def transcribe_audio_segment_async(
    client, segment_info, segment_index, model="whisper-1"
):
    """
    Transcribe a single audio segment asynchronously

    Args:
        client: AsyncOpenAI client instance
        segment_info: Audio segment information dict
        segment_index: Index of the segment
        model: Whisper model name (default: "whisper-1")
    """
    try:
        with open(segment_info["path"], "rb") as audio_file:
            transcription = await client.audio.transcriptions.create(
                model=model,
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
        return transcription, None, segment_index
    except Exception as e:
        logger.error(f"Error transcribing segment {segment_index}: {e}")
        return None, e, segment_index


async def process_audio_segments_async(client, audio_segments, model="whisper-1"):
    """
    Process audio segments asynchronously with asyncio
    This is more efficient than ThreadPoolExecutor for I/O-bound operations

    Args:
        client: AsyncOpenAI client instance
        audio_segments: List of audio segment info dicts
        model: Whisper model name (default: "whisper-1")
    """
    # Create tasks for all segments
    tasks = [
        transcribe_audio_segment_async(client, segment_info, i, model)
        for i, segment_info in enumerate(audio_segments)
    ]

    # Run all tasks concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_segments = []
    for result in results:
        # Handle exceptions from gather
        if isinstance(result, Exception):
            logger.error(f"Error in transcription task: {result}")
            continue

        transcription, error, segment_index = result

        if error:
            logger.error(f"Error in segment {segment_index}: {error}")
            continue

        segment_info = audio_segments[segment_index]

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


def process_audio_segments_parallel(client, audio_segments, model="whisper-1"):
    """
    Process audio segments in parallel using asyncio
    Wrapper function to run async code in sync context

    Args:
        client: OpenAI client instance (sync)
        audio_segments: List of audio segment info dicts
        model: Whisper model name (default: "whisper-1")
    """
    # Create async client from sync client
    # Preserve base_url if using local whisper server
    if hasattr(client, "_base_url") and client._base_url:
        async_client = AsyncOpenAI(
            api_key=client.api_key, base_url=str(client._base_url)
        )
    else:
        async_client = AsyncOpenAI(api_key=client.api_key)

    # Run async processing
    return asyncio.run(
        process_audio_segments_async(async_client, audio_segments, model)
    )
