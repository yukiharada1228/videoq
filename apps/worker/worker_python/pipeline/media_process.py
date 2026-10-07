"""Bound FFmpeg subprocesses without running Python code in a forked preexec_fn."""

from __future__ import annotations

import os
from pathlib import Path
import resource
import subprocess
import sys
import tempfile


# Match the upload formats plus the MP3 files produced internally. In particular,
# playlists/concat must not cause uploaded data to open more files or URLs.
MEDIA_INPUT_OPTIONS = [
    "-protocol_whitelist", "file",
    "-format_whitelist", "mov,matroska,webm,avi,mpeg,mpegvideo,mpegts,m4v,mp3",
]


def _positive_setting(name: str, default: int) -> int:
    raw = os.environ.get(name, str(default))
    try:
        value = int(raw)
    except ValueError:
        raise ValueError(f"{name} must be a positive integer") from None
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return value


def _apply_limits(output_limit: int | None = None) -> None:
    file_limit = _positive_setting("MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB", 1024) * 1024**2
    if output_limit is not None:
        file_limit = min(file_limit, output_limit)
    limits = [
        (resource.RLIMIT_CPU, _positive_setting("MEDIA_PROCESS_CPU_TIME_LIMIT_SECONDS", 300)),
        (resource.RLIMIT_FSIZE, file_limit),
        (resource.RLIMIT_CORE, 0),
    ]
    memory = _positive_setting("MEDIA_PROCESS_MEMORY_LIMIT_MB", 2048) * 1024**2
    # macOS does not reliably implement RLIMIT_AS. Production Lambda is Linux.
    if sys.platform == "linux":
        limits.append((resource.RLIMIT_AS, memory))
    for kind, value in limits:
        _, hard = resource.getrlimit(kind)
        effective = value if hard == resource.RLIM_INFINITY else min(value, hard)
        resource.setrlimit(kind, (effective, effective))


def run_media_process(command: list[str], *, max_output_bytes: int | None = None) -> subprocess.CompletedProcess[str]:
    if max_output_bytes is not None and max_output_bytes <= 0:
        raise ValueError("max_output_bytes must be positive")
    timeout = _positive_setting("FFMPEG_PROCESS_TIMEOUT_SECONDS", 600)
    # exec replaces this small launcher, so timeout kills FFmpeg itself. File
    # output avoids buffering attacker-controlled diagnostics in worker memory.
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        try:
            launcher = [sys.executable, str(Path(__file__).resolve())]
            if max_output_bytes is not None:
                launcher += ["--output-limit", str(max_output_bytes)]
            result = subprocess.run(
                [*launcher, *command],
                stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                timeout=timeout, check=False,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"{command[0]} exceeded its {timeout} second time limit") from None
        stdout.seek(0)
        output = stdout.read(4097)
        if len(output) > 4096:
            raise RuntimeError(f"{command[0]} returned too much output")
        stderr.seek(0, os.SEEK_END)
        stderr.seek(max(0, stderr.tell() - 2000))
        return subprocess.CompletedProcess(
            command, result.returncode, output.decode("utf-8", errors="replace"),
            stderr.read().decode("utf-8", errors="replace"),
        )


if __name__ == "__main__":
    args = sys.argv[1:]
    output_limit = None
    if args[0] == "--output-limit":
        output_limit = int(args[1])
        if output_limit <= 0:
            raise ValueError("output limit must be positive")
        args = args[2:]
    _apply_limits(output_limit)
    os.execvp(args[0], args)
