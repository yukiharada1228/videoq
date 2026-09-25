"""The fixed embedding contract used by indexing and evaluation."""

from __future__ import annotations

import json
import logging
import math
import os
import struct
from collections.abc import Mapping
from dataclasses import dataclass

EMBEDDING_DIMENSIONS = 1536
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EmbeddingConfig:
    provider: str
    model: str


def embedding_diagnostic(config: EmbeddingConfig | None = None, **details) -> dict:
    return {
        "event": "embedding.validation",
        **({"provider": config.provider, "model": config.model} if config else {}),
        "expected_dimensions": EMBEDDING_DIMENSIONS,
        **details,
    }


class EmbeddingContractError(RuntimeError):
    def __init__(self, reason: str, message: str, config: EmbeddingConfig | None = None, **details):
        super().__init__(message)
        self.reason = reason
        logger.error(json.dumps(embedding_diagnostic(config, reason=reason, **details)))


def resolve_embedding_config(environ: Mapping[str, str] | None = None) -> EmbeddingConfig:
    env = os.environ if environ is None else environ
    provider = env.get("EMBEDDING_PROVIDER", "").strip().lower() or "openai"
    if provider not in {"openai", "ollama"}:
        raise EmbeddingContractError("EMBEDDING_CONFIG_INVALID", "Unsupported embedding provider. Configure openai or ollama.")
    model = env.get("EMBEDDING_MODEL", "").strip() or (
        "text-embedding-3-small" if provider == "openai" else ""
    )
    if not model:
        raise EmbeddingContractError("EMBEDDING_CONFIG_INVALID", "EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=ollama.")
    return EmbeddingConfig(provider, model)


def invalid_output(config: EmbeddingConfig) -> EmbeddingContractError:
    return EmbeddingContractError("EMBEDDING_OUTPUT_INVALID", "Embedding response is incompatible with the 1536-dimensional storage contract.", config)


def validate_embedding(value: object, config: EmbeddingConfig) -> list[float]:
    # pgvector stores float32: reject overflow and vectors that round to all zeros.
    try:
        valid = isinstance(value, list) and len(value) == EMBEDDING_DIMENSIONS and all(
            type(v) in (int, float) and math.isfinite(v) for v in value
        )
        rounded = [struct.unpack("f", struct.pack("f", v))[0] for v in value] if valid else []
        valid = valid and all(math.isfinite(v) for v in rounded) and any(v != 0 for v in rounded)
    except (OverflowError, struct.error):
        valid = False
    if not valid:
        raise EmbeddingContractError(
            "EMBEDDING_OUTPUT_INVALID", "Embedding response is incompatible with the 1536-dimensional storage contract.",
            config, actual_dimensions=len(value) if isinstance(value, list) else None,
        )
    return value
