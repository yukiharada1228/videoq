"""LangChain helper functions"""

from typing import Optional

from django.conf import settings
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from app.domain.shared.exceptions import LLMConfigError


def get_langchain_llm(api_key: Optional[str] = None) -> BaseChatModel:
    """
    Get the configured LLM model based on LLM_PROVIDER setting.

    Args:
        api_key: Per-user OpenAI API key.

    Returns:
        BaseChatModel: Configured LLM instance.

    Raises:
        LLMConfigError: If the LLM cannot be configured due to missing key or unknown provider.
    """
    provider = getattr(settings, "LLM_PROVIDER", "openai")
    temperature = 0.0  # Temperature is fixed at 0.0

    if provider == "openai":
        resolved_key = api_key or getattr(settings, "OPENAI_API_KEY", None)
        if not resolved_key:
            raise LLMConfigError(
                "OpenAI API key is not configured. Please set your API key in Settings."
            )

        model = getattr(settings, "LLM_MODEL", "gpt-4o-mini")

        llm = ChatOpenAI(
            model=model,
            api_key=SecretStr(resolved_key),
            temperature=temperature,
        )
        llm.max_tokens = 1024
        return llm

    elif provider == "ollama":
        # Use Ollama LLM
        base_url = getattr(
            settings, "OLLAMA_BASE_URL", "http://host.docker.internal:11434"
        )
        model = getattr(settings, "LLM_MODEL", "qwen3:0.6b")

        return ChatOllama(
            model=model,
            base_url=base_url,
            temperature=temperature,
        )

    else:
        raise LLMConfigError(
            f"Invalid LLM_PROVIDER: {provider}. Must be 'openai' or 'ollama'."
        )
