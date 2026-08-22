"""Uploaded (FFmpeg + Whisper) and YouTube (SearchAPI) transcription."""

from __future__ import annotations

import json
import logging
import math
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from worker_python.env import env_str, heavy_pipeline_enabled
from worker_python.pipeline.scene_otsu import apply_scene_splitting
from worker_python.pipeline.srt import create_srt_from_whisper_segments, format_srt_time
from worker_python.pipeline.storage import download_to_path
from worker_python.video_sql import VideoRow

logger = logging.getLogger(__name__)


def run_transcription(
    video: VideoRow,
    *,
    searchapi_key: str | None = None,
    reserve_processing: Callable[[int], None] | None = None,
) -> str:
    """
    Produce SRT for a video, then apply VideoQ's Otsu scene splitting.

    When ENABLE_HEAVY_PIPELINE is off, returns a placeholder SRT so status
    transitions can be tested without FFmpeg/Whisper (no Otsu).
    """
    if not heavy_pipeline_enabled():
        logger.info(
            "ENABLE_HEAVY_PIPELINE off; placeholder transcript for video %d", video.id
        )
        if reserve_processing:
            reserve_processing(1)
        return (
            "1\n"
            "00:00:00,000 --> 00:00:01,000\n"
            "[placeholder transcript — enable ENABLE_HEAVY_PIPELINE for real transcription]\n"
        )

    if video.source_type == "youtube":
        if not video.youtube_video_id:
            raise RuntimeError("youtube_video_id is required for YouTube transcription.")
        raw_srt, duration = _transcribe_youtube(video.youtube_video_id, searchapi_key)
        if reserve_processing:
            reserve_processing(max(1, math.ceil(duration)))
    elif not video.file_key:
        raise RuntimeError(f"Video {video.id} has no file key for uploaded transcription.")
    else:
        raw_srt = _transcribe_uploaded(video.file_key, reserve_processing)

    original_count = sum(
        1 for line in raw_srt.split("\n") if line.strip().isdigit()
    )
    logger.info("Applying Otsu scene splitting for video %d", video.id)
    scene_srt, _ = apply_scene_splitting(
        raw_srt, original_segment_count=original_count or None
    )
    return scene_srt


def _transcribe_uploaded(
    file_key: str,
    reserve_processing: Callable[[int], None] | None = None,
) -> str:
    with tempfile.TemporaryDirectory(prefix="videoq-tx-") as tmp:
        tmp_dir = Path(tmp)
        video_path = tmp_dir / Path(file_key).name
        download_to_path(file_key, video_path)
        if reserve_processing:
            reserve_processing(max(1, math.ceil(_ffprobe_duration(video_path))))
        audio_path = tmp_dir / "audio.mp3"
        _ffmpeg_extract_mp3(video_path, audio_path)
        segments = _whisper_transcribe(audio_path)
        srt = create_srt_from_whisper_segments(segments)
        if not srt.strip():
            raise RuntimeError("Whisper returned an empty transcript")
        return srt


def _ffmpeg_extract_mp3(video_path: Path, audio_path: Path) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-acodec",
        "mp3",
        "-ab",
        "64k",
        "-ar",
        "16000",
        "-ac",
        "1",
        str(audio_path),
    ]
    logger.info("Running ffmpeg extract: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg failed ({proc.returncode}): {proc.stderr[-1000:]}"
        )
    if not audio_path.is_file() or audio_path.stat().st_size == 0:
        raise RuntimeError("ffmpeg produced empty audio")


def _whisper_transcribe(audio_path: Path) -> list[dict[str, Any]]:
    from openai import OpenAI

    backend = env_str("WHISPER_BACKEND", "openai").lower()
    if backend in {"whisper.cpp", "local"}:
        client = OpenAI(
            api_key=env_str("OPENAI_API_KEY") or "dummy-key-for-local",
            base_url=env_str("WHISPER_LOCAL_URL", "http://127.0.0.1:8080"),
        )
        model = "whisper-local"
    else:
        api_key = env_str("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for OpenAI Whisper")
        client = OpenAI(api_key=api_key)
        model = "whisper-1"

    # Whisper API soft limit ~25MB; split longer audio into ~10min chunks if needed.
    size_mb = audio_path.stat().st_size / (1024 * 1024)
    if size_mb <= 24:
        return _whisper_file(client, audio_path, model, offset=0.0)

    chunks = _split_audio_chunks(audio_path, chunk_seconds=600)
    all_segments: list[dict[str, Any]] = []
    for offset, chunk_path in chunks:
        all_segments.extend(_whisper_file(client, chunk_path, model, offset=offset))
    return all_segments


def _whisper_file(
    client: Any, audio_path: Path, model: str, *, offset: float
) -> list[dict[str, Any]]:
    with audio_path.open("rb") as fh:
        result = client.audio.transcriptions.create(
            model=model,
            file=fh,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    segments = getattr(result, "segments", None) or []
    out: list[dict[str, Any]] = []
    for seg in segments:
        if isinstance(seg, dict):
            start = float(seg.get("start", 0)) + offset
            end = float(seg.get("end", start)) + offset
            text = str(seg.get("text", ""))
        else:
            start = float(getattr(seg, "start", 0)) + offset
            end = float(getattr(seg, "end", start)) + offset
            text = str(getattr(seg, "text", ""))
        out.append({"start": start, "end": end, "text": text})
    if not out and getattr(result, "text", None):
        # Fallback when backend returns text only.
        out.append({"start": offset, "end": offset + 1.0, "text": str(result.text)})
    return out


def _split_audio_chunks(audio_path: Path, chunk_seconds: int) -> list[tuple[float, Path]]:
    duration = _ffprobe_duration(audio_path)
    chunks: list[tuple[float, Path]] = []
    start = 0.0
    idx = 0
    while start < duration:
        out = audio_path.with_name(f"chunk_{idx}.mp3")
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            str(start),
            "-t",
            str(chunk_seconds),
            "-i",
            str(audio_path),
            "-acodec",
            "copy",
            str(out),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg chunk split failed: {proc.stderr[-500:]}")
        chunks.append((start, out))
        start += chunk_seconds
        idx += 1
    return chunks


def _ffprobe_duration(path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {proc.stderr[-500:]}")
    return float(proc.stdout.strip())


def _transcribe_youtube(
    youtube_video_id: str, api_key: str | None
) -> tuple[str, float]:
    key = (api_key or "").strip()
    if not key:
        raise RuntimeError(
            "SearchAPI API key is not configured. Set your SearchAPI API key in "
            "Settings before importing YouTube videos."
        )
    transcript = _fetch_youtube_transcript(youtube_video_id, key)
    blocks: list[str] = []
    max_end = 0.0
    for index, item in enumerate(transcript, start=1):
        start = float(item.get("start", 0))
        duration = float(item.get("duration", 0))
        text = str(item.get("text", "")).replace("\n", " ").strip()
        if not text:
            continue
        start_ms = int(start * 1000)
        end_ms = int((start + duration) * 1000)
        max_end = max(max_end, start + duration)
        blocks.append(
            f"{index}\n"
            f"{format_srt_time(start_ms / 1000)} --> {format_srt_time(end_ms / 1000)}\n"
            f"{text}"
        )
    if not blocks:
        raise RuntimeError("No transcript available for this YouTube video.")
    return "\n\n".join(blocks) + "\n", max_end


def _fetch_youtube_transcript(youtube_video_id: str, api_key: str) -> list[dict]:
    base_url = env_str(
        "SEARCHAPI_BASE_URL", "https://www.searchapi.io/api/v1/search"
    )
    timeout = int(env_str("SEARCHAPI_TIMEOUT_SECONDS", "60") or "60")
    attempts = [
        {
            "video_id": youtube_video_id,
            "transcript_type": "manual",
            "only_available": "true",
        },
        {
            "video_id": youtube_video_id,
            "transcript_type": "auto",
            "only_available": "true",
        },
    ]
    last_error: RuntimeError | None = None
    for params in attempts:
        query = {"engine": "youtube_transcripts", **params}
        req = Request(
            f"{base_url}?{urlencode(query)}",
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
        )
        try:
            with urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            last_error = RuntimeError(f"SearchAPI HTTP {exc.code}: {detail}")
            continue
        except URLError as exc:
            raise RuntimeError(f"SearchAPI unreachable: {exc}") from exc

        transcripts = payload.get("transcripts") or []
        if transcripts:
            return transcripts
        langs = payload.get("available_languages") or []
        if langs:
            last_error = RuntimeError(
                "No YouTube transcript was returned. Available languages: "
                + ", ".join(
                    str(e.get("lang") or e.get("name"))
                    for e in langs
                    if isinstance(e, dict)
                )
            )
    if last_error:
        raise last_error
    raise RuntimeError("No transcript available for this YouTube video.")
