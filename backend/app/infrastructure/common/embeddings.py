"""Embedding provider factory for supporting multiple embedding backends."""

from django.conf import settings
from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings
from langchain_openai import OpenAIEmbeddings
from pydantic import SecretStr

from app.infrastructure.common.provider_registry import (
    create_from_provider_registry,
    get_provider_setting,
    resolve_openai_api_key,
)


def get_embeddings() -> Embeddings:
    """Get the configured embedding model based on EMBEDDING_PROVIDER setting."""
    provider = get_provider_setting("EMBEDDING_PROVIDER", "openai")
    return create_from_provider_registry(
        "EMBEDDING_PROVIDER",
        provider,
        {
            "openai": _create_openai_embeddings,
            "ollama": _create_ollama_embeddings,
        },
    )


def _create_openai_embeddings() -> Embeddings:
    api_key = resolve_openai_api_key(purpose="OpenAI embeddings")
    return OpenAIEmbeddings(
        model=settings.EMBEDDING_MODEL,
        api_key=SecretStr(api_key),
    )


def _create_ollama_embeddings() -> Embeddings:
    return OllamaEmbeddings(
        model=settings.EMBEDDING_MODEL,
        base_url=settings.OLLAMA_BASE_URL,
    )
