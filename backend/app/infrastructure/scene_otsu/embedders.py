from abc import ABC
from typing import List, Optional

import numpy as np
import tiktoken
from django.conf import settings
from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings
from langchain_openai import OpenAIEmbeddings
from pydantic import SecretStr
from tqdm import tqdm

from app.infrastructure.common.provider_registry import (
    create_from_provider_registry,
    get_provider_setting,
    resolve_openai_api_key,
)


class BaseEmbedder(ABC):
    """Abstract base class for embedding generation"""

    embeddings: Embeddings
    encoding: tiktoken.Encoding

    def __init__(self, batch_size: int = 16):
        self.batch_size = batch_size

    def count_tokens(self, text: str) -> int:
        """Count tokens in text using the provided encoding"""
        return len(self.encoding.encode(text))

    def _embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Actually call the provider API for a batch of texts"""
        if self.embeddings is None:
            raise NotImplementedError("Subclass must initialize self.embeddings")
        return self.embeddings.embed_documents(texts)

    def get_embeddings(self, texts: List[str]) -> np.ndarray:
        """Common logic to generate embeddings in batches with a progress bar"""
        all_embeddings = []
        for i in tqdm(
            range(0, len(texts), self.batch_size),
            desc=f"Generating embeddings ({self.__class__.__name__})",
        ):
            batch = texts[i : i + self.batch_size]
            batch_embeds = self._embed_batch(batch)
            all_embeddings.append(np.array(batch_embeds))
        return np.vstack(all_embeddings)


class OpenAIEmbedder(BaseEmbedder):
    def __init__(
        self, api_key: str, model: str = "text-embedding-3-small", batch_size: int = 16
    ):
        super().__init__(batch_size=batch_size)
        self.model = model
        self.embeddings = OpenAIEmbeddings(api_key=SecretStr(api_key), model=model)
        self.encoding = tiktoken.encoding_for_model(model)


class OllamaEmbedder(BaseEmbedder):
    """Ollama-based embedder using LangChain"""

    def __init__(
        self,
        model: str = "qwen3-embedding:0.6b",
        base_url: str = "http://localhost:11434",
        batch_size: int = 16,
    ):
        super().__init__(batch_size=batch_size)
        self.model = model
        self.base_url = base_url
        self.embeddings = OllamaEmbeddings(model=model, base_url=base_url)
        self.encoding = tiktoken.get_encoding("cl100k_base")


def create_embedder(
    api_key: Optional[str] = None, batch_size: int = 16
) -> BaseEmbedder:
    """Create embedder based on EMBEDDING_PROVIDER setting"""
    provider = get_provider_setting("EMBEDDING_PROVIDER", "openai")
    return create_from_provider_registry(
        "EMBEDDING_PROVIDER",
        provider,
        {
            "openai": lambda: _create_openai_embedder(api_key, batch_size),
            "ollama": lambda: _create_ollama_embedder(batch_size),
        },
    )


def _create_openai_embedder(api_key: Optional[str], batch_size: int) -> BaseEmbedder:
    resolved_key = resolve_openai_api_key(
        api_key,
        allow_settings_fallback=False,
        purpose="OpenAI embeddings",
    )
    return OpenAIEmbedder(
        api_key=resolved_key,
        model=settings.EMBEDDING_MODEL,
        batch_size=batch_size,
    )


def _create_ollama_embedder(batch_size: int) -> BaseEmbedder:
    return OllamaEmbedder(
        model=settings.EMBEDDING_MODEL,
        base_url=settings.OLLAMA_BASE_URL,
        batch_size=batch_size,
    )
