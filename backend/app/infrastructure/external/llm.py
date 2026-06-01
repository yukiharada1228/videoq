"""LangChain helper functions"""

from typing import Optional

from django.conf import settings
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from app.infrastructure.common.provider_registry import (
    create_from_provider_registry,
    get_provider_setting,
    resolve_openai_api_key,
)


def get_langchain_llm(api_key: Optional[str] = None) -> BaseChatModel:
    """
    Get the configured LLM model based on LLM_PROVIDER setting.

    Args:
        api_key: Per-user OpenAI API key.

    Returns:
        BaseChatModel: Configured LLM instance.

    Raises:
        ProviderConfigError: If the LLM cannot be configured due to missing key or unknown provider.
    """
    provider = get_provider_setting("LLM_PROVIDER", "openai")
    return create_from_provider_registry(
        "LLM_PROVIDER",
        provider,
        {
            "openai": lambda: _create_openai_llm(api_key),
            "ollama": _create_ollama_llm,
        },
    )


def _create_openai_llm(api_key: Optional[str] = None) -> BaseChatModel:
    resolved_key = resolve_openai_api_key(api_key, purpose="OpenAI LLM")
    model = getattr(settings, "LLM_MODEL", "gpt-4o-mini")

    llm = ChatOpenAI(
        model=model,
        api_key=SecretStr(resolved_key),
        temperature=0.0,
    )
    llm.max_tokens = 1024
    return llm


def _create_ollama_llm() -> BaseChatModel:
    base_url = getattr(settings, "OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    model = getattr(settings, "LLM_MODEL", "qwen3:0.6b")

    return ChatOllama(
        model=model,
        base_url=base_url,
        temperature=0.0,
    )
