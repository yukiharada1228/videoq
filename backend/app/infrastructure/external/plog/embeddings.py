"""Embedding helper for PLOG concepts / summaries."""

from __future__ import annotations

import math
from typing import List, Optional, Sequence

from app.domain.plog.gateways import PlogEmbeddingGateway
from app.infrastructure.common.embeddings import get_embeddings


class LangchainPlogEmbeddingGateway(PlogEmbeddingGateway):
    def embed_texts(
        self, texts: Sequence[str], api_key: Optional[str] = None
    ) -> List[List[float]]:
        del api_key  # embeddings resolve API key from settings / env
        if not texts:
            return []
        embeddings = get_embeddings()
        return embeddings.embed_documents(list(texts))


def cosine_similarity(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def best_match_index(query: Sequence[float], candidates: Sequence[Sequence[float]]) -> int:
    best_i = -1
    best_s = -1.0
    for i, c in enumerate(candidates):
        s = cosine_similarity(query, c)
        if s > best_s:
            best_s = s
            best_i = i
    return best_i
