import base64
from io import BytesIO
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from worker_python.pipeline import openrouter_federation as federation
from worker_python.pipeline import embeddings, transcription


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    monkeypatch.setattr(federation, "_CACHE", None)
    monkeypatch.setenv("OPENROUTER_FEDERATION_POLICY_ID", "worker-policy")
    monkeypatch.setenv("AWS_REGION", "ap-northeast-1")
    monkeypatch.setenv("OPENROUTER_API_KEY", "old-fixed-key")
    monkeypatch.setenv("WHISPER_BACKEND", "openrouter")
    for key in ("OPENAI_BASE_URL", "EMBEDDING_BASE_URL", "EMBEDDING_API_KEY", "EMBEDDING_MODEL"):
        monkeypatch.delenv(key, raising=False)


def mock_exchange(monkeypatch, scope="inference"):
    import boto3
    clock = [1000.0]
    monkeypatch.setattr(federation.time, "time", lambda: clock[0])
    sts = MagicMock()

    def jwt(**kwargs):
        assert kwargs == {"Audience": ["https://openrouter.ai"], "SigningAlgorithm": "RS256", "DurationSeconds": 900}
        encoded = base64.urlsafe_b64encode(json.dumps({"exp": clock[0] + 900}).encode()).decode().rstrip("=")
        return {"WebIdentityToken": f"header.{encoded}.signature"}

    sts.get_web_identity_token.side_effect = jwt
    create = MagicMock(return_value=sts)
    monkeypatch.setattr(boto3, "client", create)

    def exchange(request, **kwargs):
        from urllib.parse import parse_qs
        assert request.full_url == "https://openrouter.ai/api/v1/oauth/token"
        params = parse_qs(request.data.decode())
        assert params["federation_policy_id"] == ["worker-policy"]
        assert params["scope"] == ["inference"]
        return BytesIO(json.dumps({"access_token": "short-token", "token_type": "Bearer", "scope": scope, "expires_in": 900}).encode())

    http = MagicMock(side_effect=exchange)
    monkeypatch.setattr(federation, "urlopen", http)
    return clock, sts, create, http


def test_role_tokens_are_exchanged_cached_and_refreshed(monkeypatch):
    clock, sts, create, http = mock_exchange(monkeypatch)
    assert federation.openrouter_token() == "short-token"
    assert federation.openrouter_token() == "short-token"
    assert http.call_count == 1
    assert create.call_args.kwargs["endpoint_url"] == "https://sts.ap-northeast-1.amazonaws.com"
    clock[0] += 850
    assert federation.openrouter_token() == "short-token"
    assert http.call_count == 2
    assert sts.close.call_count == 2


def test_both_worker_adapters_use_federation_not_stale_fixed_keys(monkeypatch, tmp_path):
    mock_exchange(monkeypatch)
    monkeypatch.setenv("EMBEDDING_API_KEY", "stale-embedding-key")
    vector = [1.0] + [0.0] * 1535

    def embedding_request(request, **kwargs):
        assert request.get_header("Authorization") == "Bearer short-token"
        assert json.loads(request.data)["model"] == "openai/text-embedding-3-small"
        return BytesIO(json.dumps({"data": [{"index": 0, "embedding": vector}]}).encode())

    monkeypatch.setattr(embeddings.urllib.request, "urlopen", embedding_request)
    assert embeddings.embed_texts(["fixture"]) == [vector]
    client, model = transcription._whisper_client()
    with client:
        assert client.api_key == "short-token"
        assert model == "openai/whisper-large-v3-turbo"
    fake_client = MagicMock()
    fake_client.audio.transcriptions.create.return_value = SimpleNamespace(segments=[], text="")
    audio = tmp_path / "clip.mp3"
    audio.write_bytes(b"fixture")
    transcription._whisper_file(fake_client, audio, model, offset=0)
    assert fake_client.api_key == "short-token"


@pytest.mark.parametrize("scope", ["management", None])
def test_wrong_scope_is_rejected(monkeypatch, scope):
    mock_exchange(monkeypatch, scope)
    with pytest.raises(RuntimeError, match="exchange failed"):
        federation.openrouter_token()
    assert federation._CACHE is None


def test_errors_are_redacted_and_do_not_fall_back(monkeypatch):
    import boto3
    failure = MagicMock(side_effect=RuntimeError("PRIVATE JWT AND CREDENTIALS"))
    monkeypatch.setattr(boto3, "client", failure)
    for _ in range(2):
        with pytest.raises(RuntimeError, match="exchange failed") as error:
            embeddings.embed_texts(["fixture"])
        assert "PRIVATE" not in str(error.value)
    assert failure.call_count == 2
