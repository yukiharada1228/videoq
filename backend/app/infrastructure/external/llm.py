"""LangChain helper functions"""

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from app.domain.shared.exceptions import LLMConfigError

User = get_user_model()


def get_langchain_llm(user) -> BaseChatModel:
    """
    Get the configured LLM model based on LLM_PROVIDER setting.

    Args:
        user: The user object (currently unused but kept for compatibility)

    Returns:
        BaseChatModel: Configured LLM instance.

    Raises:
        LLMConfigError: If the LLM cannot be configured due to missing key or unknown provider.
    """
    provider = getattr(settings, "LLM_PROVIDER", "openai")
    temperature = 0.0  # Temperature is fixed at 0.0

    if provider == "openai":
        # Use OpenAI API key from environment variable
        api_key = getattr(settings, "OPENAI_API_KEY", None) or os.environ.get(
            "OPENAI_API_KEY"
        )
        if not api_key:
            raise LLMConfigError(
                "OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable."
            )

        # Use LLM model from environment variable with fallback to default
        model = getattr(settings, "LLM_MODEL", None) or os.environ.get(
            "LLM_MODEL", "gpt-4o-mini"
        )

        return ChatOpenAI(
            model=model,
            api_key=SecretStr(api_key),
            temperature=temperature,
        )

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
