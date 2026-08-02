"""LangChain helper functions"""

from collections.abc import Callable

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


def get_langchain_llm(api_key: str | None = None) -> BaseChatModel:
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
    builders: dict[str, Callable[[], BaseChatModel]] = {
        "openai": lambda: _create_openai_llm(api_key),
        "ollama": _create_ollama_llm,
    }
    return create_from_provider_registry("LLM_PROVIDER", provider, builders)


def get_langchain_grading_llm(api_key: str | None = None) -> BaseChatModel:
    """Small-model LLM for GradeReply (paper §3.2 / Algorithm 1 line 15)."""
    provider = get_provider_setting("LLM_PROVIDER", "openai")
    builders: dict[str, Callable[[], BaseChatModel]] = {
        "openai": lambda: _create_openai_llm(api_key, max_tokens=256),
        "ollama": _create_ollama_llm,
    }
    return create_from_provider_registry("LLM_PROVIDER", provider, builders)


def get_langchain_extraction_llm(api_key: str | None = None) -> BaseChatModel:
    """Offline PLOG Stage1/2 extraction needs a large completion budget.

    Stage2 JSON (edges + per-concept learning objects) routinely exceeds the
    default chat ``max_tokens=1024`` and otherwise truncates mid-JSON, dropping
    all edges after parse failure.
    """
    provider = get_provider_setting("LLM_PROVIDER", "openai")
    builders: dict[str, Callable[[], BaseChatModel]] = {
        "openai": lambda: _create_openai_llm(api_key, max_tokens=8192),
        "ollama": _create_ollama_llm,
    }
    return create_from_provider_registry("LLM_PROVIDER", provider, builders)


def _create_openai_llm(
    api_key: str | None = None,
    *,
    max_tokens: int = 1024,
    prompt_cache_key: str | None = None,
) -> BaseChatModel:
    resolved_key = resolve_openai_api_key(api_key, purpose="OpenAI LLM")
    model = getattr(settings, "LLM_MODEL", "gpt-4o-mini")

    del prompt_cache_key  # reserved; automatic prefix caching uses identical system bytes
    llm = ChatOpenAI(
        model=model,
        api_key=SecretStr(resolved_key),
        temperature=0.0,
    )
    llm.max_tokens = max_tokens
    return llm


def get_langchain_study_llm(
    api_key: str | None = None, *, prompt_cache_key: str | None = None
) -> BaseChatModel:
    """LLM for the single generative nudge (paper §3.3)."""
    provider = get_provider_setting("LLM_PROVIDER", "openai")
    builders: dict[str, Callable[[], BaseChatModel]] = {
        "openai": lambda: _create_openai_llm(
            api_key, prompt_cache_key=prompt_cache_key
        ),
        "ollama": _create_ollama_llm,
    }
    return create_from_provider_registry("LLM_PROVIDER", provider, builders)


def _create_ollama_llm() -> BaseChatModel:
    base_url = getattr(settings, "OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    model = getattr(settings, "LLM_MODEL", "qwen3:0.6b")

    return ChatOllama(
        model=model,
        base_url=base_url,
        temperature=0.0,
    )
