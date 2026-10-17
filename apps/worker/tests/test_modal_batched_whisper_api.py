"""The proxy-authenticated endpoint validates requests before invoking the GPU."""

import importlib.util
import ast
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest


def test_every_modal_web_function_requires_proxy_auth():
    path = Path(__file__).resolve().parents[1] / "modal_batched_whisper.py"
    module = ast.parse(path.read_text())
    web_decorators = [
        decorator
        for node in ast.walk(module)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        for decorator in node.decorator_list
        if isinstance(decorator, ast.Call)
        and isinstance(decorator.func, ast.Attribute)
        and decorator.func.attr == "asgi_app"
    ]
    assert web_decorators
    assert all(
        any(
            keyword.arg == "requires_proxy_auth"
            and isinstance(keyword.value, ast.Constant)
            and keyword.value.value is True
            for keyword in decorator.keywords
        )
        for decorator in web_decorators
    )


@pytest.fixture
def modal_api():
    path = Path(__file__).resolve().parents[1] / "modal_batched_whisper.py"
    spec = importlib.util.spec_from_file_location("videoq_modal_batched_whisper_test", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    calls = []

    async def invoke(audio):
        calls.append(audio)
        return {"ok": True, "result": {"text": "認識結果", "segments": []}}

    service = SimpleNamespace(transcribe=SimpleNamespace(
        remote=SimpleNamespace(aio=invoke),
    ))
    return module, TestClient(module.create_web_app(service)), calls


def test_valid_request_forwards_only_audio(modal_api):
    _, client, calls = modal_api
    response = client.post(
        "/v1/audio/transcriptions",
        data={"model": "large-v3", "response_format": "verbose_json"},
        files={"file": ("audio.mp3", b"audio")},
    )
    assert response.status_code == 200
    assert response.json()["text"] == "認識結果"
    assert calls == [b"audio"]


def test_invalid_settings_never_invoke_gpu(modal_api):
    _, client, calls = modal_api
    response = client.post(
        "/v1/audio/transcriptions",
        data={"model": "other-model"},
        files={"file": ("audio.mp3", b"audio")},
    )
    assert response.status_code == 400
    assert calls == []


def test_invalid_audio_is_reported_as_client_error(modal_api):
    module, _, _ = modal_api

    async def reject(_audio):
        return {"ok": False, "error": "audio duration must be between 0 and 1801 seconds"}

    service = SimpleNamespace(transcribe=SimpleNamespace(remote=SimpleNamespace(aio=reject)))
    client = TestClient(module.create_web_app(service))
    response = client.post(
        "/v1/audio/transcriptions",
        data={"model": "large-v3"},
        files={"file": ("audio.mp3", b"bad audio")},
    )
    assert response.status_code == 400


@pytest.mark.parametrize("declared_length", [None, "1"])
def test_body_limit_applies_without_trust_in_content_length(modal_api, declared_length):
    module, client, calls = modal_api
    headers = {"content-type": "application/octet-stream"}
    if declared_length is not None:
        headers["content-length"] = declared_length
    request = client.build_request(
        "POST",
        "/v1/audio/transcriptions",
        headers=headers,
        content=iter([b"x" * (module.MAX_AUDIO_BYTES + 65537)]),
    )
    assert request.headers.get("content-length") == declared_length
    response = client.send(request)
    assert response.status_code == 413
    assert calls == []
