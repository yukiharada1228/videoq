from __future__ import annotations

import httpx
import openai
import pytest

from worker_python.pipeline import plog_build, transcription


@pytest.mark.parametrize("pipeline", ["plog", "whisper", "whisper-local"])
@pytest.mark.parametrize("fails", [False, True])
def test_pipeline_closes_http_client_after_success_or_failure(
    monkeypatch,
    tmp_path,
    pipeline,
    fails,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv(
        "WHISPER_BACKEND", "local" if pipeline == "whisper-local" else "openai"
    )

    def respond(request):
        if fails:
            return httpx.Response(500, json={"error": {"message": "Unavailable"}})
        if request.url.path.endswith("/chat/completions"):
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": '{"concepts":[]}'}}],
                },
            )
        return httpx.Response(
            200,
            json={
                "text": "Hello",
                "segments": [{"start": 0, "end": 1, "text": "Hello"}],
            },
        )

    # Exercise the installed SDK's actual context manager without network access.
    with httpx.Client(transport=httpx.MockTransport(respond)) as http_client:
        client = openai.OpenAI(
            api_key="test-key", http_client=http_client, max_retries=0
        )
        monkeypatch.setattr(openai, "OpenAI", lambda **_: client)
        audio = tmp_path / "audio.mp3"
        audio.write_bytes(b"audio")

        def run():
            if pipeline == "plog":
                return plog_build._extract_concepts("Recording test")
            return transcription._whisper_transcribe(audio)

        if fails:
            with pytest.raises(openai.InternalServerError):
                run()
        else:
            result = run()
            assert result == (
                []
                if pipeline == "plog"
                else [
                    {"start": 0.0, "end": 1.0, "text": "Hello"},
                ]
            )
        assert client.is_closed()
