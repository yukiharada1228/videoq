"""Embedding + token counting for Otsu scene split (no langchain)."""

from __future__ import annotations

import logging

import numpy as np
import tiktoken

from worker_python.pipeline.embedding_contract import resolve_embedding_config
from worker_python.pipeline.embeddings import embed_texts

logger = logging.getLogger(__name__)


class SceneEmbedder:
    def __init__(self, batch_size: int = 16):
        self.batch_size = batch_size
        self.encoding = _resolve_encoding()

    def count_tokens(self, text: str) -> int:
        return len(self.encoding.encode(text))

    def get_embeddings(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, 0), dtype=np.float64)
        all_embeddings: list[np.ndarray] = []
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            vectors = embed_texts(batch)
            all_embeddings.append(np.asarray(vectors, dtype=np.float64))
        return np.vstack(all_embeddings)


def create_embedder(*, batch_size: int = 16) -> SceneEmbedder:
    return SceneEmbedder(batch_size=batch_size)


def _resolve_encoding() -> tiktoken.Encoding:
    config = resolve_embedding_config()
    model = config.model
    if config.provider == "openai":
        try:
            return tiktoken.encoding_for_model(model)
        except KeyError:
            logger.info("tiktoken has no encoding for %s; using cl100k_base", model)
    return tiktoken.get_encoding("cl100k_base")
