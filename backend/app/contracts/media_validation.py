"""Shared media validation helpers usable from multiple layers."""

import json
import platform
import subprocess
from types import ModuleType

resource_module: ModuleType | None
try:
    import resource
except ImportError:  # pragma: no cover - non-Unix fallback
    resource_module = None
else:
    resource_module = resource


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


def build_media_preexec_fn(
    cpu_time_limit_seconds: int = 30,
    memory_limit_mb: int = 1024,
    output_file_size_limit_mb: int = 512,
):
    """Apply conservative resource limits to ffmpeg/ffprobe child processes on Unix."""
    if platform.system() == "Windows" or resource_module is None:
        return None

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


def run_media_command(
    command: list[str],
    timeout_seconds: int,
    cpu_time_limit_seconds: int = 30,
    memory_limit_mb: int = 1024,
    output_file_size_limit_mb: int = 512,
):
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=True,
        timeout=timeout_seconds,
        preexec_fn=build_media_preexec_fn(
            cpu_time_limit_seconds=cpu_time_limit_seconds,
            memory_limit_mb=memory_limit_mb,
            output_file_size_limit_mb=output_file_size_limit_mb,
        ),
    )


def probe_media_file(
    input_path: str,
    timeout_seconds: int = 10,
    cpu_time_limit_seconds: int = 30,
    memory_limit_mb: int = 1024,
    output_file_size_limit_mb: int = 512,
):
    """Inspect a media file with ffprobe and return parsed metadata."""
    try:
        probe_result = run_media_command(
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
            timeout_seconds=timeout_seconds,
            cpu_time_limit_seconds=cpu_time_limit_seconds,
            memory_limit_mb=memory_limit_mb,
            output_file_size_limit_mb=output_file_size_limit_mb,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
        raise InvalidMediaFileError("Uploaded file could not be validated as a video.") from exc

    try:
        return json.loads(probe_result.stdout)
    except json.JSONDecodeError as exc:
        raise InvalidMediaFileError("Uploaded file could not be validated as a video.") from exc


def validate_video_media_file(
    input_path: str,
    allowed_container_formats: set[str] | None = None,
    timeout_seconds: int = 10,
    cpu_time_limit_seconds: int = 30,
    memory_limit_mb: int = 1024,
    output_file_size_limit_mb: int = 512,
):
    """Validate that a file is a supported video container with at least one video stream."""
    probe = probe_media_file(
        input_path,
        timeout_seconds=timeout_seconds,
        cpu_time_limit_seconds=cpu_time_limit_seconds,
        memory_limit_mb=memory_limit_mb,
        output_file_size_limit_mb=output_file_size_limit_mb,
    )
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
