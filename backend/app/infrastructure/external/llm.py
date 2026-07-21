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


def get_langchain_grading_llm(api_key: Optional[str] = None) -> BaseChatModel:
    """Small-model LLM for GradeReply (paper §3.2 / Algorithm 1 line 15)."""
    provider = get_provider_setting("LLM_PROVIDER", "openai")
    return create_from_provider_registry(
        "LLM_PROVIDER",
        provider,
        {
            "openai": lambda: _create_openai_llm(
                api_key, model_setting="LLM_GRADE_MODEL", max_tokens=256
            ),
            "ollama": lambda: _create_ollama_llm(model_setting="LLM_GRADE_MODEL"),
        },
    )


def get_langchain_extraction_llm(api_key: Optional[str] = None) -> BaseChatModel:
    """Offline PLOG Stage1/2 extraction needs a large completion budget.

    Stage2 JSON (edges + per-concept learning objects) routinely exceeds the
    default chat ``max_tokens=1024`` and otherwise truncates mid-JSON, dropping
    all edges after parse failure.
    """
    provider = get_provider_setting("LLM_PROVIDER", "openai")
    return create_from_provider_registry(
        "LLM_PROVIDER",
        provider,
        {
            "openai": lambda: _create_openai_llm(api_key, max_tokens=8192),
            "ollama": _create_ollama_llm,
        },
    )


def _create_openai_llm(
    api_key: Optional[str] = None,
    *,
    model_setting: str = "LLM_MODEL",
    max_tokens: int = 1024,
    prompt_cache_key: Optional[str] = None,
) -> BaseChatModel:
    resolved_key = resolve_openai_api_key(api_key, purpose="OpenAI LLM")
    # Paper §3.3: large study nudge / small grading; QA stays on LLM_MODEL.
    if model_setting == "LLM_GRADE_MODEL":
        default = "gpt-4o-mini"
    elif model_setting == "LLM_STUDY_MODEL":
        default = "gpt-4o"
    else:
        default = "gpt-4o-mini"
    model = getattr(settings, model_setting, getattr(settings, "LLM_MODEL", default))

    del prompt_cache_key  # reserved; automatic prefix caching uses identical system bytes
    llm = ChatOpenAI(
        model=model,
        api_key=SecretStr(resolved_key),
        temperature=0.0,
    )
    llm.max_tokens = max_tokens
    return llm


def get_langchain_study_llm(
    api_key: Optional[str] = None, *, prompt_cache_key: Optional[str] = None
) -> BaseChatModel:
    """Large-model LLM for the single generative nudge (paper §3.3)."""
    provider = get_provider_setting("LLM_PROVIDER", "openai")
    return create_from_provider_registry(
        "LLM_PROVIDER",
        provider,
        {
            "openai": lambda: _create_openai_llm(
                api_key,
                model_setting="LLM_STUDY_MODEL",
                prompt_cache_key=prompt_cache_key,
            ),
            "ollama": lambda: _create_ollama_llm(model_setting="LLM_STUDY_MODEL"),
        },
    )


def _create_ollama_llm(*, model_setting: str = "LLM_MODEL") -> BaseChatModel:
    base_url = getattr(settings, "OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    if model_setting == "LLM_GRADE_MODEL":
        default = "qwen3:0.6b"
    elif model_setting == "LLM_STUDY_MODEL":
        default = "qwen3:8b"
    else:
        default = "qwen3:0.6b"
    model = getattr(settings, model_setting, getattr(settings, "LLM_MODEL", default))

    return ChatOllama(
        model=model,
        base_url=base_url,
        temperature=0.0,
    )
