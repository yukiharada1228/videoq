from types import SimpleNamespace

from fastapi.testclient import TestClient
from openai import OpenAI
import pytest

import server


@pytest.fixture
def client(monkeypatch):
    calls = []
    def transcribe(path, **kwargs):
        calls.append((path, kwargs))
        return iter([SimpleNamespace(start=1.25, end=2.5, text=" Caption")]), SimpleNamespace(language="en", duration=3)
    monkeypatch.setattr(server, "load_model", lambda: SimpleNamespace(transcribe=transcribe))
    with TestClient(server.app) as client:
        yield client, calls


def test_sdk_receives_segments_and_temporary_audio_is_deleted(client):
    from pathlib import Path
    transport, calls = client
    # Exercise the real SDK multipart encoding against the ASGI application.
    with OpenAI(api_key="local", base_url="http://testserver/v1", http_client=transport) as sdk:
        result = sdk.audio.transcriptions.create(
            model="whisper-local", file=("clip.mp3", b"audio"),
            response_format="verbose_json", timestamp_granularities=["segment"],
        )
        assert result.segments[0].start == 1.25
        assert result.segments[0].text == " Caption"
    assert not Path(calls[0][0]).exists()
    assert calls[0][1]["vad_filter"] is True


@pytest.mark.parametrize("model,content,status", [("remote/model", b"a", 400), ("whisper-local", b"", 400)])
def test_bad_requests_never_run_inference(client, model, content, status):
    transport, calls = client
    response = transport.post("/v1/audio/transcriptions", data={"model": model}, files={"file": ("a.mp3", content)})
    assert response.status_code == status
    assert calls == []


def test_oversized_audio_is_rejected_and_lock_is_released(client, monkeypatch):
    transport, calls = client
    monkeypatch.setattr(server, "MAX_AUDIO_BYTES", 3)
    response = transport.post("/v1/audio/transcriptions", data={"model": "whisper-local"}, files={"file": ("a", b"1234")})
    assert response.status_code == 413
    assert calls == []
    assert server.model_lock.acquire(blocking=False)
    server.model_lock.release()


def test_model_loading_never_downloads(monkeypatch):
    import faster_whisper
    calls = []
    monkeypatch.setattr(faster_whisper, "WhisperModel", lambda *args, **kwargs: calls.append((args, kwargs)))
    server.load_model()
    assert calls[0][1]["local_files_only"] is True
