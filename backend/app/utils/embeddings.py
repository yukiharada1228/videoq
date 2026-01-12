"""Embedding provider factory for supporting multiple embedding backends."""

from typing import Optional

from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings
from langchain_openai import OpenAIEmbeddings
from pydantic import SecretStr

from videoq import settings


def get_embeddings(api_key: Optional[str] = None) -> Embeddings:
    """
    Get the configured embedding model based on EMBEDDING_PROVIDER setting.

    Args:
        api_key: Optional API key for OpenAI. Required when using OpenAI provider.

    Returns:
        Embeddings: An instance of the configured embedding model.

    Raises:
        ValueError: If the provider is invalid or required credentials are missing.
    """
    provider = settings.EMBEDDING_PROVIDER

    if provider == "openai":
        if not api_key:
            raise ValueError("OpenAI API key is required when using OpenAI embeddings")
        return OpenAIEmbeddings(
            model=settings.EMBEDDING_MODEL, api_key=SecretStr(api_key)
        )

    elif provider == "ollama":
        return OllamaEmbeddings(
            model=settings.EMBEDDING_MODEL, base_url=settings.OLLAMA_BASE_URL
        )

    else:
        raise ValueError(
            f"Invalid EMBEDDING_PROVIDER: {provider}. Must be 'openai' or 'ollama'."
        )
