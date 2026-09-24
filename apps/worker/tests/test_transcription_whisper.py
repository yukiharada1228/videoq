from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import openai
import pytest

from worker_python.pipeline import transcription
from worker_python.pipeline.transcription import _whisper_file


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

    monkeypatch.setattr(transcription, "subprocess", SimpleNamespace(run=split))
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
