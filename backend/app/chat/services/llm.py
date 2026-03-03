"""LangChain helper functions"""

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

User = get_user_model()


class ChatServiceError(Exception):
    """Application-level chat error with HTTP metadata for the view layer."""

    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def get_langchain_llm(user) -> BaseChatModel:
    """
    Get the configured LLM model based on LLM_PROVIDER setting.

    Args:
        user: The user object (currently unused but kept for compatibility)

    Returns:
        BaseChatModel: Configured LLM instance.
    """
    provider = getattr(settings, "LLM_PROVIDER", "openai")
    temperature = 0.0  # Temperature is fixed at 0.0

    if provider == "openai":
        # Use OpenAI API key from environment variable
        api_key = getattr(settings, "OPENAI_API_KEY", None) or os.environ.get(
            "OPENAI_API_KEY"
        )
        if not api_key:
            raise ChatServiceError(
                "OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.",
                400,
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

    if provider == "ollama":
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

    raise ChatServiceError(
        f"Invalid LLM_PROVIDER: {provider}. Must be 'openai' or 'ollama'.",
        400,
    )


def handle_langchain_exception(exception: Exception) -> ChatServiceError:
    error_message = str(exception)

    if (
        "invalid_api_key" in error_message.lower()
        or "authentication" in error_message.lower()
    ):
        return ChatServiceError("Invalid API key", 401)

    if "rate_limit" in error_message.lower():
        return ChatServiceError("API rate limit reached", 429)

    return ChatServiceError(f"OpenAI API error: {exception}", 500)
