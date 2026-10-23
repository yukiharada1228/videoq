from types import SimpleNamespace
from unittest.mock import MagicMock
from pathlib import Path

import httpx
import openai
import pytest

from worker_python.pipeline import transcription
from worker_python.pipeline.transcription import _whisper_file


def test_unknown_backend_never_falls_back_to_openai(monkeypatch):
    monkeypatch.setenv("WHISPER_BACKEND", "locla")
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-be-used")
    with pytest.raises(RuntimeError, match="Unsupported WHISPER_BACKEND"):
        transcription._whisper_client()


def test_modal_whisper_client_uses_its_own_token_and_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("WHISPER_BACKEND", "modal")
    monkeypatch.setenv("WHISPER_MODAL_URL", "https://videoq-example.modal.run")
    monkeypatch.setenv("WHISPER_MODAL_TOKEN", "modal-test-token")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    client, model = transcription._whisper_client()
    try:
        assert model == "large-v3"
        assert str(client.base_url) == "https://videoq-example.modal.run/v1/"
        assert client.api_key == "modal-test-token"
    finally:
        client.close()


def test_modal_whisper_requires_url_and_token(monkeypatch) -> None:
    monkeypatch.setenv("WHISPER_BACKEND", "modal")
    monkeypatch.delenv("WHISPER_MODAL_TOKEN", raising=False)
    monkeypatch.setenv("WHISPER_MODAL_URL", "https://videoq-example.modal.run")
    with pytest.raises(RuntimeError, match="WHISPER_MODAL_URL and WHISPER_MODAL_TOKEN"):
        transcription._whisper_client()


def test_modal_accepts_thirty_minute_audio_interval(monkeypatch) -> None:
    monkeypatch.setenv("WHISPER_BACKEND", "modal")
    client = MagicMock()
    monkeypatch.setattr(transcription, "_whisper_client", lambda: (client, "large-v3"))
    monkeypatch.setattr(transcription, "_whisper_file", lambda *args, **kwargs: [
        {"start": 601, "end": 602, "text": "caption"},
    ])

    def extract(command, **kwargs):
        assert command[command.index("-t") + 1] == "1800"
        assert kwargs["max_output_bytes"] == 16 * 1024 * 1024
        Path(command[-1]).write_bytes(b"audio")
        return SimpleNamespace(returncode=0, stderr="")

    monkeypatch.setattr(transcription, "run_media_process", extract)
    assert transcription.transcribe_audio_interval("video.mkv", 600, 1800) == [
        {"start": 601.0, "end": 602.0, "text": "caption"},
    ]


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


def test_onprem_rejects_youtube_before_any_external_provider(monkeypatch):
    from types import SimpleNamespace
    from worker_python.pipeline import transcription
    monkeypatch.setenv("DEPLOYMENT_EDITION", "onprem")
    monkeypatch.setattr(transcription, "_transcribe_youtube", lambda *_: pytest.fail("external YouTube request"))
    with pytest.raises(RuntimeError, match="disabled"):
        transcription.run_transcription(SimpleNamespace(id=1, source_type="youtube", youtube_video_id="test"), searchapi_key="stale")
