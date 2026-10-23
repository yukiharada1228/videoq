"""Opt-in real-model batching check, with no model downloads or external calls.

Set LOCAL_WHISPER_TEST_MODEL to a local faster-whisper model directory and
LOCAL_WHISPER_TEST_SPEECH to a nonsensitive 8–20 second speech clip. The test
repeats that clip with long silent gaps to exercise multiple inference chunks
and source-relative timestamp restoration through the actual HTTP/SDK boundary.
"""

import io
import math
import os
from pathlib import Path
import wave

from fastapi.testclient import TestClient
from openai import OpenAI
import pytest

import server


@pytest.mark.skipif(
    not os.environ.get("LOCAL_WHISPER_TEST_MODEL"),
    reason="Explicit local model and nonsensitive speech clip required",
)
def test_real_batched_api_restores_timestamps_across_silence(monkeypatch, record_property):
    import numpy as np
    from faster_whisper import BatchedInferencePipeline
    from faster_whisper.audio import decode_audio

    speech_path = os.environ.get("LOCAL_WHISPER_TEST_SPEECH")
    assert speech_path and Path(speech_path).is_file(), "LOCAL_WHISPER_TEST_SPEECH is required"
    speech = decode_audio(speech_path, sampling_rate=16000)
    assert 8 <= len(speech) / 16000 <= 20, "Use an 8–20 second clip with audible speech"
    pieces = []
    regions = []
    position = 0
    for _ in range(5):
        silence = np.zeros(10 * 16000, dtype=np.float32)
        pieces.extend([silence, speech])
        position += len(silence)
        regions.append((position / 16000, (position + len(speech)) / 16000))
        position += len(speech)
    audio = np.concatenate(pieces)
    upload = io.BytesIO()
    with wave.open(upload, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())

    monkeypatch.setenv("WHISPER_MODEL_PATH", os.environ["LOCAL_WHISPER_TEST_MODEL"])
    monkeypatch.setenv("WHISPER_DEVICE", "cpu")
    monkeypatch.setenv("WHISPER_COMPUTE_TYPE", "int8")
    monkeypatch.setenv("WHISPER_CPU_THREADS", "2")
    monkeypatch.setenv("WHISPER_BATCH_SIZE", "8")
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    batches = []
    forward = BatchedInferencePipeline.forward

    def observe(self, features, tokenizer, chunks_metadata, options):
        batches.append(len(features))
        assert options.without_timestamps is False
        return forward(self, features, tokenizer, chunks_metadata, options)

    monkeypatch.setattr(BatchedInferencePipeline, "forward", observe)
    with TestClient(server.app) as transport:
        with OpenAI(api_key="local", base_url="http://testserver/v1", http_client=transport) as sdk:
            result = sdk.audio.transcriptions.create(
                model="whisper-local", file=("speech.wav", upload.getvalue()),
                response_format="verbose_json", timestamp_granularities=["segment"],
            )

    assert max(batches, default=0) > 1, "The test must actually infer multiple chunks together"
    record_property("max_batch_size", max(batches))
    record_property("source_duration_seconds", result.duration)
    assert result.duration == pytest.approx(len(audio) / 16000, abs=0.1)
    assert result.segments
    starts = []
    for segment in result.segments:
        assert segment.text.strip()
        assert math.isfinite(segment.start) and math.isfinite(segment.end)
        assert 0 <= segment.start < segment.end <= result.duration + 0.1
        # VAD pads each speech region; allow 1 s of boundary tolerance, while
        # rejecting timestamps restored into the middle of a 10 s silent gap.
        assert any(start - 1 <= segment.start <= end + 1 for start, end in regions), (segment.start, segment.end, regions)
        starts.append(segment.start)
    assert starts == sorted(starts)
    for start, end in regions:
        assert any(start <= segment.start < end for segment in result.segments), (
            "Speech region was lost or shifted", (start, end),
            [(segment.start, segment.end) for segment in result.segments],
        )
    assert result.segments[-1].end >= regions[-1][1] - 5, "The final speech must not be truncated"
