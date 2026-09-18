"""VideoQ embedding providers shared with the API (OpenAI / Ollama)."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from worker_python.env import env_str
from .embedding_contract import (
    EMBEDDING_DIMENSIONS,
    EmbeddingConfig,
    invalid_output,
    resolve_embedding_config,
    validate_embedding,
)

logger = logging.getLogger(__name__)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    config = resolve_embedding_config()
    if config.provider == "ollama":
        return _embed_ollama(texts, config)
    return _embed_openai_batch(texts, config)


def _embed_openai_batch(texts: list[str], config: EmbeddingConfig) -> list[list[float]]:
    api_key = env_str("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for OpenAI embeddings")
    base = env_str("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    body: dict = {"model": config.model, "input": texts, "encoding_format": "float", "dimensions": EMBEDDING_DIMENSIONS}

    req = urllib.request.Request(
        f"{base}/embeddings",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = _read_payload(resp, config)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"OpenAI embeddings failed (HTTP {exc.code}).") from None
    except urllib.error.URLError:
        raise RuntimeError("OpenAI embeddings request failed. Check the server connection.") from None

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list) or len(data) != len(texts) or not all(
        isinstance(item, dict) and type(item.get("index")) is int for item in data
    ) or sorted(item["index"] for item in data) != list(range(len(texts))):
        raise invalid_output(config)
    return [validate_embedding(item.get("embedding"), config) for item in sorted(data, key=lambda item: item["index"])]


def _embed_ollama(texts: list[str], config: EmbeddingConfig) -> list[list[float]]:
    base = env_str("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    req = urllib.request.Request(
        f"{base}/api/embed",
        data=json.dumps({"model": config.model, "input": texts, "dimensions": EMBEDDING_DIMENSIONS}).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = _read_payload(resp, config)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Ollama embeddings failed (HTTP {exc.code}).") from None
    except urllib.error.URLError:
        raise RuntimeError("Ollama embeddings request failed. Check the server connection.") from None
    vectors = payload.get("embeddings") if isinstance(payload, dict) else None
    if not isinstance(vectors, list) or len(vectors) != len(texts):
        raise invalid_output(config)
    return [validate_embedding(vector, config) for vector in vectors]


def _read_payload(response, config: EmbeddingConfig):
    try:
        return json.loads(response.read().decode("utf-8"))
    except (ValueError, UnicodeError):
        raise invalid_output(config) from None


def to_vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in embedding) + "]"
