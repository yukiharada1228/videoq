"""Embedding providers (OpenAI / Ollama) aligned with apps/api and Django."""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from worker_python.env import env_str

logger = logging.getLogger(__name__)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    provider = env_str("EMBEDDING_PROVIDER", "openai").lower()
    if provider == "ollama":
        return [_embed_ollama(t) for t in texts]
    if provider == "openai":
        return _embed_openai_batch(texts)
    raise RuntimeError(f"Unsupported EMBEDDING_PROVIDER={provider!r}")


def _embed_openai_batch(texts: list[str]) -> list[list[float]]:
    api_key = env_str("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for OpenAI embeddings")
    model = env_str("EMBEDDING_MODEL", "text-embedding-3-small")
    base = env_str("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    body: dict = {"model": model, "input": texts, "encoding_format": "float"}
    dims_raw = env_str("EMBEDDING_VECTOR_SIZE")
    if dims_raw.isdigit() and int(dims_raw) > 0:
        body["dimensions"] = int(dims_raw)

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
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"OpenAI embeddings failed ({exc.code}): {detail}") from exc

    data = sorted(payload.get("data") or [], key=lambda d: int(d.get("index", 0)))
    out: list[list[float]] = []
    for item in data:
        emb = item.get("embedding")
        if not isinstance(emb, list) or not emb:
            raise RuntimeError("OpenAI embeddings response missing vectors")
        out.append([float(x) for x in emb])
    if len(out) != len(texts):
        raise RuntimeError(
            f"OpenAI returned {len(out)} embeddings for {len(texts)} inputs"
        )
    return out


def _embed_ollama(text: str) -> list[float]:
    model = env_str("EMBEDDING_MODEL")
    if not model:
        raise RuntimeError("EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=ollama")
    base = env_str("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    req = urllib.request.Request(
        f"{base}/api/embeddings",
        data=json.dumps({"model": model, "prompt": text}).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Ollama embeddings unreachable at {base}: {exc}") from exc
    emb = payload.get("embedding")
    if not isinstance(emb, list) or not emb:
        raise RuntimeError("Ollama embeddings response missing vector")
    return [float(x) for x in emb]


def to_vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in embedding) + "]"
