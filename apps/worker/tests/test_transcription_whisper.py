from types import SimpleNamespace
from unittest.mock import MagicMock
from pathlib import Path

import httpx
import openai
import pytest

from worker_python.pipeline import transcription
from worker_python.pipeline.transcription import _whisper_file


def test_openai_rejects_thirty_minute_audio_interval(monkeypatch) -> None:
    monkeypatch.setenv("WHISPER_BACKEND", "openai")
    with pytest.raises(ValueError, match="Invalid transcription interval"):
        transcription.transcribe_audio_interval("video.mkv", 0, 1800)


@pytest.mark.parametrize("as_object", [False, True])
@pytest.mark.parametrize("has_end", [False, True])
def test_chunk_offsets_are_applied_once_even_without_segment_end(
    tmp_path,
    as_object,
    has_end,
) -> None:
    segment = {"start": 10.0, "text": "Caption"}
    if has_end:
        segment["end"] = 12.0
    client = MagicMock()
    client.audio.transcriptions.create.return_value = SimpleNamespace(
        segments=[SimpleNamespace(**segment) if as_object else segment],
    )
    audio = tmp_path / "chunk.mp3"
    audio.write_bytes(b"audio")

    assert _whisper_file(client, audio, "test", offset=600.0) == [
        {
            "start": 610.0,
            "end": 612.0 if has_end else 610.0,
            "text": "Caption",
        }
    ]


@pytest.mark.parametrize("backend", ["openai", "local"])
@pytest.mark.parametrize("failure", [None, "transcribe", "split"])
def test_large_audio_processes_and_removes_one_chunk_at_a_time(
    monkeypatch, tmp_path, backend, failure
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("WHISPER_BACKEND", backend)
    audio = tmp_path / "audio.mp3"
    with audio.open("wb") as source:
        source.truncate(25 * 1024 * 1024)
    monkeypatch.setattr(transcription, "_ffprobe_duration", lambda _: 1201.0)
    events = []

    def split(cmd, **kwargs):
        index = len([event for event in events if event[0] == "split"])
        events.append(("split", index))
        assert cmd[cmd.index("-ss") + 1] == str(index * 600.0)
        assert cmd[cmd.index("-t") + 1] == "600"
        # The previous chunk has been consumed before another file is written.
        assert list(tmp_path.glob("chunk_*.mp3")) == []
        (tmp_path / f"chunk_{index}.mp3").write_bytes(b"audio chunk")
        return SimpleNamespace(
            returncode=1 if failure == "split" and index == 1 else 0,
            stderr="split failed",
        )

    def transcribe(request):
        index = len([event for event in events if event[0] == "transcribe"])
        events.append(("transcribe", index))
        assert [path.name for path in tmp_path.glob("chunk_*.mp3")] == [
            f"chunk_{index}.mp3"
        ]
        if failure == "transcribe" and index == 1:
            return httpx.Response(500, json={"error": {"message": "Unavailable"}})
        return httpx.Response(
            200,
            json={"segments": [{"start": 1, "end": 2, "text": "Caption"}]},
        )

    monkeypatch.setattr(transcription, "run_media_process", split)
    with httpx.Client(transport=httpx.MockTransport(transcribe)) as http_client:
        client = openai.OpenAI(
            api_key="test-key", http_client=http_client, max_retries=0
        )
        monkeypatch.setattr(openai, "OpenAI", lambda **_: client)
        if failure == "transcribe":
            with pytest.raises(openai.InternalServerError):
                transcription._whisper_transcribe(audio)
        elif failure == "split":
            with pytest.raises(RuntimeError, match="ffmpeg chunk split failed"):
                transcription._whisper_transcribe(audio)
        else:
            assert transcription._whisper_transcribe(audio) == [
                {"start": start + 1, "end": start + 2, "text": "Caption"}
                for start in [0, 600, 1200]
            ]
        assert client.is_closed()
    assert list(tmp_path.glob("chunk_*.mp3")) == []
    assert audio.stat().st_size == 25 * 1024 * 1024
    expected = [("split", 0), ("transcribe", 0), ("split", 1)]
    if failure != "split":
        expected.append(("transcribe", 1))
    if failure is None:
        expected.extend([("split", 2), ("transcribe", 2)])
    assert events == expected


def test_cloud_uses_hosted_whisper_1_by_default(monkeypatch):
    monkeypatch.setenv("OPENAI_BASE_URL", "http://private-chat.invalid:8000/v1")
    monkeypatch.delenv("WHISPER_BACKEND", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client, model = transcription._whisper_client()
    with client:
        assert model == "whisper-1"
        assert str(client.base_url) == "https://api.openai.com/v1/"
        assert client.timeout == 120
        assert client.max_retries == 2


def test_local_gateway_has_time_for_multiple_cpu_speech_spans(monkeypatch):
    monkeypatch.setenv("WHISPER_BACKEND", "local")
    monkeypatch.setenv("WHISPER_LOCAL_URL", "http://private-whisper.invalid:8080/v1")
    client, model = transcription._whisper_client()
    with client:
        assert model == "whisper-local"
        assert str(client.base_url) == "http://private-whisper.invalid:8080/v1/"
        assert client.timeout == 660


@pytest.mark.parametrize("backend", ["modal", "whisper.cpp", "typo"])
def test_retired_or_unknown_backend_is_rejected(monkeypatch, backend):
    monkeypatch.setenv("WHISPER_BACKEND", backend)
    with pytest.raises(RuntimeError, match="configure openrouter, openai or local"):
        transcription._whisper_client()


def test_text_without_real_timestamps_is_rejected(tmp_path):
    audio = tmp_path / "clip.mp3"
    audio.write_bytes(b"audio")
    client = MagicMock()
    client.audio.transcriptions.create.return_value = SimpleNamespace(segments=[], text="caption")
    with pytest.raises(RuntimeError, match="real segment timestamps"):
        _whisper_file(client, audio, "whisper-1", offset=600)


def test_silent_audio_can_return_no_segments(tmp_path):
    audio = tmp_path / "clip.mp3"
    audio.write_bytes(b"audio")
    client = MagicMock()
    client.audio.transcriptions.create.return_value = SimpleNamespace(segments=[], text="")
    assert _whisper_file(client, audio, "whisper-1", offset=600) == []


def test_openrouter_key_unifies_whisper_and_preserves_model_and_timeouts(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENROUTER_API_KEY", "router-key")
    monkeypatch.delenv("WHISPER_BACKEND", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "old-direct-key")
    seen = []

    def respond(request):
        assert str(request.url) == "https://openrouter.ai/api/v1/audio/transcriptions"
        assert request.headers["authorization"] == "Bearer router-key"
        body = request.read()
        assert b"openai/whisper-large-v3-turbo" in body
        assert b"verbose_json" in body
        assert b'timestamp_granularities[]' in body
        assert b"segment" in body
        seen.append(request.url)
        return httpx.Response(200, json={"text": "Caption", "segments": [{"start": 1.25, "end": 2.5, "text": "Caption"}]})

    original = openai.OpenAI
    with httpx.Client(transport=httpx.MockTransport(respond)) as transport:
        monkeypatch.setattr(openai, "OpenAI", lambda **kw: original(**kw, http_client=transport))
        client, model = transcription._whisper_client()
        audio = tmp_path / "clip.mp3"
        audio.write_bytes(b"audio")
        with client:
            assert model == "openai/whisper-large-v3-turbo"
            assert transcription._whisper_file(client, audio, model, offset=300) == [
                {"start": 301.25, "end": 302.5, "text": "Caption"},
            ]
        assert client.is_closed()
    assert len(seen) == 1


def test_openrouter_backend_requires_its_own_key(monkeypatch):
    monkeypatch.setenv("WHISPER_BACKEND", "openrouter")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "direct-only")
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        transcription._whisper_client()
