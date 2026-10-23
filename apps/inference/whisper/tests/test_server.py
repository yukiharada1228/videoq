from types import SimpleNamespace

from fastapi.testclient import TestClient
from openai import OpenAI
import pytest

import server


@pytest.fixture(params=[1, 8])
def client(monkeypatch, request):
    import faster_whisper

    monkeypatch.setenv("WHISPER_BATCH_SIZE", str(request.param))
    calls = []
    def transcribe(path, **kwargs):
        calls.append((path, kwargs))
        return iter([SimpleNamespace(start=1.25, end=2.5, text=" Caption")]), SimpleNamespace(language="en", duration=3)
    model = SimpleNamespace(transcribe=transcribe)
    monkeypatch.setattr(server, "load_model", lambda: model)

    def batch_pipeline(*, model):
        assert model is server.app.state.model
        return SimpleNamespace(transcribe=lambda *args, **kwargs: model.transcribe(*args, **kwargs))

    monkeypatch.setattr(faster_whisper, "BatchedInferencePipeline", batch_pipeline)
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
    assert calls[0][1]["without_timestamps"] is False
    assert calls[0][1].get("batch_size", 1) == transport.app.state.batch_size


def test_subtitles_are_bounded_by_the_original_audio_duration(client, monkeypatch):
    transport, _ = client
    rows = [
        SimpleNamespace(start=-0.25, end=1, text=" First"),
        SimpleNamespace(start=2, end=3.64, text=" Last"),
        SimpleNamespace(start=4, end=5, text=" Outside audio"),
    ]
    monkeypatch.setattr(transport.app.state.model, "transcribe", lambda *args, **kwargs: (
        iter(rows), SimpleNamespace(language="en", duration=3),
    ))
    response = transport.post("/v1/audio/transcriptions", data={"model": "whisper-local"}, files={"file": ("a.mp3", b"audio")})
    assert response.status_code == 200
    assert response.json()["segments"] == [
        {"id": 0, "start": 0, "end": 1, "text": " First"},
        {"id": 1, "start": 2, "end": 3, "text": " Last"},
    ]


@pytest.mark.parametrize("start,end", [(float("nan"), 2), (1, float("inf"))])
def test_nonfinite_timestamps_are_rejected(client, monkeypatch, start, end):
    transport, _ = client
    monkeypatch.setattr(transport.app.state.model, "transcribe", lambda *args, **kwargs: (
        iter([SimpleNamespace(start=start, end=end, text=" Invalid")]),
        SimpleNamespace(language="en", duration=3),
    ))
    response = transport.post("/v1/audio/transcriptions", data={"model": "whisper-local"}, files={"file": ("a.mp3", b"audio")})
    assert response.status_code == 422
    assert server.model_lock.acquire(blocking=False)
    server.model_lock.release()


@pytest.mark.parametrize("value", ["0", "-1", "65", "1.5", "eight", ""])
def test_invalid_batch_size_fails_startup_before_loading_weights(monkeypatch, value):
    monkeypatch.setenv("WHISPER_BATCH_SIZE", value)

    def load():
        pytest.fail("Invalid configuration must fail before loading weights")

    monkeypatch.setattr(server, "load_model", load)
    with pytest.raises(ValueError, match="WHISPER_BATCH_SIZE"):
        with TestClient(server.app):
            pass


def test_failed_batch_iteration_cleans_up_and_next_request_uses_fresh_pipeline(monkeypatch):
    from pathlib import Path
    import faster_whisper

    monkeypatch.setenv("WHISPER_BATCH_SIZE", "8")
    model = object()
    monkeypatch.setattr(server, "load_model", lambda: model)
    paths = []
    pipelines = []

    class Pipeline:
        def __init__(self, *, model):
            assert model is server.app.state.model
            pipelines.append(self)

        def transcribe(self, path, **kwargs):
            paths.append(Path(path))

            def segments():
                if len(pipelines) == 1:
                    raise RuntimeError("private inference details")
                yield SimpleNamespace(start=1, end=2, text=" recovered")

            return segments(), SimpleNamespace(language="en", duration=3)

    monkeypatch.setattr(faster_whisper, "BatchedInferencePipeline", Pipeline)
    with TestClient(server.app) as transport:
        request = {"model": "whisper-local"}
        first = transport.post("/v1/audio/transcriptions", data=request, files={"file": ("a.mp3", b"audio")})
        assert first.status_code == 422
        assert "private" not in first.text
        assert not paths[0].exists()
        second = transport.post("/v1/audio/transcriptions", data=request, files={"file": ("a.mp3", b"audio")})
        assert second.status_code == 200
        assert second.json()["segments"][0]["text"] == " recovered"
    assert len(pipelines) == 2
    assert all(not path.exists() for path in paths)


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
