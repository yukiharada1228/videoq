from __future__ import annotations

import json
from dataclasses import asdict
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from worker_python.pipeline import embeddings, evaluation, plog_build
from worker_python.pipeline.embedding_contract import (
    EMBEDDING_DIMENSIONS, EmbeddingContractError, resolve_embedding_config, validate_embedding,
)
from worker_python.pipeline.embedding_schema import assert_embedding_schema
from worker_python.pipeline.langchain_embeddings import VideoQEmbeddings
from worker_python.pipeline.scene_otsu import apply_scene_splitting
from worker_python.tasks import reindexing

FIXTURE = json.loads((Path(__file__).resolve().parents[3] / "test-fixtures/embedding-contract.json").read_text())
VECTOR = [1.0] + [0.0] * (FIXTURE["dimensions"] - 1)


def test_fixed_dimension():
    assert EMBEDDING_DIMENSIONS == FIXTURE["dimensions"]


@pytest.mark.parametrize("case", FIXTURE["configCases"])
def test_shared_settings(case):
    if "error" in case:
        with pytest.raises(EmbeddingContractError) as caught:
            resolve_embedding_config(case["env"])
        assert caught.value.reason == case["error"]
    else:
        assert asdict(resolve_embedding_config(case["env"])) == case["expected"]


@pytest.mark.parametrize("vector", [
    [], [1, 2], [1] * 2560, [0] * 1536, None,
    ["1"] + VECTOR[1:], [True] + VECTOR[1:],
    [float("nan")] + VECTOR[1:], [float("inf")] + VECTOR[1:],
    [1e300] + VECTOR[1:], [1e-300] + VECTOR[1:],
])
def test_rejects_invalid_vectors(vector):
    with pytest.raises(EmbeddingContractError) as caught:
        validate_embedding(vector, resolve_embedding_config({}))
    assert caught.value.reason == "EMBEDDING_OUTPUT_INVALID"


def response(monkeypatch, payload):
    urlopen = MagicMock(side_effect=lambda *args, **kwargs: BytesIO(json.dumps(payload).encode()))
    monkeypatch.setattr(embeddings.urllib.request, "urlopen", urlopen)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    return urlopen


@pytest.mark.parametrize("provider", ["openai", "ollama"])
def test_provider_uses_fixed_dimension_and_validates_batch(monkeypatch, provider):
    monkeypatch.setenv("EMBEDDING_PROVIDER", provider)
    monkeypatch.setenv("EMBEDDING_MODEL", "model")
    payload = {"data": [{"index": 1, "embedding": VECTOR}, {"index": 0, "embedding": VECTOR}]} if provider == "openai" else {"embeddings": [VECTOR, VECTOR]}
    http = response(monkeypatch, payload)
    assert embeddings.embed_texts(["first", "second"]) == [VECTOR, VECTOR]
    request = http.call_args.args[0]
    assert json.loads(request.data) == {"model": "model", "input": ["first", "second"], "dimensions": 1536, **({"encoding_format": "float"} if provider == "openai" else {})}
    assert request.full_url.endswith("/v1/embeddings" if provider == "openai" else "/api/embed")


@pytest.mark.parametrize("indices", [[0, 0], [1, 2], [0], [0, True], [0, "1"]])
def test_openai_batch_rejects_missing_duplicate_and_invalid_indices(monkeypatch, indices):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
    response(monkeypatch, {"data": [{"index": i, "embedding": VECTOR} for i in indices]})
    with pytest.raises(EmbeddingContractError):
        embeddings.embed_texts(["first", "second"])


@pytest.mark.parametrize("payload", [{"embeddings": [[1] * 2560]}, {"embedding": VECTOR}, {"embeddings": [VECTOR, VECTOR]}, None])
def test_ollama_invalid_response_never_falls_back(monkeypatch, payload):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "ollama")
    monkeypatch.setenv("EMBEDDING_MODEL", "qwen3-embedding:4b")
    http = response(monkeypatch, payload)
    with pytest.raises(EmbeddingContractError):
        embeddings.embed_texts(["input"])
    http.assert_called_once()


@pytest.mark.parametrize("row", [None, {"type_name": "vector", "dimensions": 1024}, {"type_name": "vector", "dimensions": -1}, {"type_name": "text", "dimensions": 1536}])
def test_declared_schema_rejects_incompatible_empty_tables(row):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = row
    with pytest.raises(EmbeddingContractError) as caught:
        assert_embedding_schema(conn, resolve_embedding_config({}))
    assert caught.value.reason == "EMBEDDING_SCHEMA_MISMATCH"


def test_ragas_uses_the_validated_adapter(monkeypatch):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "ollama")
    monkeypatch.setenv("EMBEDDING_MODEL", "qwen3-embedding:4b")
    http = response(monkeypatch, {"embeddings": [VECTOR]})
    assert isinstance(evaluation._langchain_embeddings(), VideoQEmbeddings)
    assert evaluation._langchain_embeddings().embed_query("question") == VECTOR
    assert json.loads(http.call_args.args[0].data)["dimensions"] == 1536


def test_config_errors_are_not_hidden_by_scene_or_evaluation_fallback(monkeypatch):
    error = EmbeddingContractError("EMBEDDING_CONFIG_INVALID", "bad config")
    splitter = MagicMock()
    splitter.process.side_effect = error
    monkeypatch.setattr("worker_python.pipeline.scene_otsu.SceneSplitter", MagicMock(return_value=splitter))
    with pytest.raises(EmbeddingContractError):
        apply_scene_splitting("subtitle")
    metric = MagicMock()
    async def fail(_sample):
        raise error
    metric.single_turn_ascore = fail
    with pytest.raises(EmbeddingContractError):
        evaluation._run_metric(metric, object())


@pytest.mark.parametrize("stage", ["schema", "output"])
def test_reindex_preflight_preserves_existing_vectors(monkeypatch, stage):
    error = EmbeddingContractError("EMBEDDING_OUTPUT_INVALID", "bad dimensions")
    schema = MagicMock(side_effect=error if stage == "schema" else None)
    embed = MagicMock(side_effect=error if stage == "output" else None)
    delete = MagicMock()
    monkeypatch.setattr(reindexing.vector_index, "check_embedding_storage", schema)
    monkeypatch.setattr(reindexing, "embed_texts", embed)
    monkeypatch.setattr(reindexing.vector_index, "delete_all_vectors", delete)
    with pytest.raises(EmbeddingContractError):
        reindexing._run_reindex([object()])
    delete.assert_not_called()


def test_invalid_plog_embeddings_do_not_delete_existing_material(monkeypatch):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
    monkeypatch.setattr(plog_build, "_extract_concepts", lambda *_: [{"label": "concept"}])
    response(monkeypatch, {"data": [{"index": 0, "embedding": [1, 2]}]})
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {"type_name": "vector", "dimensions": 1536}
    with pytest.raises(EmbeddingContractError) as caught:
        plog_build.run_plog_pipeline(conn, 42, "subtitle")
    assert caught.value.reason == "EMBEDDING_OUTPUT_INVALID"
    assert not any("DELETE" in call.args[0] for call in conn.execute.call_args_list)
