"""Opt-in real speech acceptance for native whisper.cpp and faster-whisper.

Provide LOCAL_AI_TEST_WHISPER_BASE_URL and LOCAL_AI_TEST_WHISPER_VIDEO, pointing
to a nonsensitive local video with at least 15 seconds of speech. No downloads,
object storage uploads or database writes are performed by this test.
"""

import math
import os
from pathlib import Path

import httpx
import openai
import pytest

from worker_python.pipeline import transcription
from worker_python.pipeline.srt import create_srt_from_whisper_segments


@pytest.mark.skipif(
    not os.environ.get("LOCAL_AI_TEST_WHISPER_BASE_URL"),
    reason="Explicit local speech API and video required",
)
def test_local_whisper_preserves_real_segment_timestamps(monkeypatch):
    video_path = os.environ.get("LOCAL_AI_TEST_WHISPER_VIDEO")
    assert video_path, "LOCAL_AI_TEST_WHISPER_VIDEO is required"
    video = Path(video_path)
    assert video.is_file(), "Provide a nonsensitive local speech video"
    base_url = os.environ["LOCAL_AI_TEST_WHISPER_BASE_URL"].rstrip("/")
    monkeypatch.setenv("WHISPER_BACKEND", "local")
    monkeypatch.setenv("WHISPER_LOCAL_URL", base_url)
    monkeypatch.setenv("OPENAI_API_KEY", "local-inference")

    # Observe real wire responses so the worker's text-only fallback cannot make
    # this check pass. Keep the production client configuration and SDK parser.
    payloads = []
    requests = []

    def observe(response):
        response.read()
        requests.append(response.request)
        payloads.append(response.json())

    constructor = openai.OpenAI

    def observed_client(**kwargs):
        return constructor(
            **kwargs,
            http_client=httpx.Client(
                trust_env=False, event_hooks={"response": [observe]},
            ),
        )

    monkeypatch.setattr(openai, "OpenAI", observed_client)
    offset, duration = 2.0, 12.0
    segments = transcription.transcribe_audio_interval(video, offset, duration)

    assert len(requests) == 1
    assert str(requests[0].url) == f"{base_url}/audio/transcriptions"
    raw = payloads[0]["segments"]
    assert raw, "The API must return segment timestamps, not only text"
    for segment in raw:
        assert segment["text"].strip()
        assert math.isfinite(segment["start"]) and math.isfinite(segment["end"])
        assert 0 <= segment["start"] < segment["end"]

    assert segments
    assert len(segments) == len(raw)
    for actual, original in zip(segments, raw, strict=True):
        assert actual["text"] == original["text"]
        assert actual["start"] == pytest.approx(offset + original["start"])
        assert actual["end"] == pytest.approx(min(offset + duration, offset + original["end"]))
        assert offset <= actual["start"] < actual["end"] <= offset + duration

    srt = create_srt_from_whisper_segments(segments)
    assert transcription.format_srt_time(segments[0]["start"]) in srt
    assert segments[0]["text"].strip() in srt
