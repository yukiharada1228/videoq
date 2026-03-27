"""Embedding provider factory for supporting multiple embedding backends."""

from langchain_core.embeddings import Embeddings
from langchain_ollama import OllamaEmbeddings
from langchain_openai import OpenAIEmbeddings
from pydantic import SecretStr

from videoq import settings


def get_embeddings() -> Embeddings:
    """Get the configured embedding model based on EMBEDDING_PROVIDER setting."""
    provider = settings.EMBEDDING_PROVIDER

    if provider == "openai":
        api_key = getattr(settings, "OPENAI_API_KEY", None)
        if not api_key:
            raise ValueError(
                "OpenAI API key is required when using OpenAI embeddings. "
                "Please set OPENAI_API_KEY in the server environment."
            )
        return OpenAIEmbeddings(
            model=settings.EMBEDDING_MODEL, api_key=SecretStr(api_key)
        )

    if provider == "ollama":
        return OllamaEmbeddings(
            model=settings.EMBEDDING_MODEL, base_url=settings.OLLAMA_BASE_URL
        )

    raise ValueError(
        f"Invalid EMBEDDING_PROVIDER: {provider}. Must be 'openai' or 'ollama'."
    )
