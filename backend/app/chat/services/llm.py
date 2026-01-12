"""LangChain helper functions"""

import os
from typing import Optional, Tuple, Union

from django.conf import settings
from django.contrib.auth import get_user_model
from langchain_core.language_models import BaseChatModel
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import SecretStr
from rest_framework import status
from rest_framework.response import Response

from app.common.responses import create_error_response

User = get_user_model()


def get_langchain_llm(user) -> Tuple[Optional[BaseChatModel], Optional[Response]]:
    """
    Get the configured LLM model based on LLM_PROVIDER setting.

    Args:
        user: The user object (currently unused but kept for compatibility)

    Returns:
        Tuple[Optional[BaseChatModel], Optional[Response]]:
            A tuple of (LLM instance, error response). If successful, returns (llm, None).
            If failed, returns (None, error_response).
    """
    provider = getattr(settings, "LLM_PROVIDER", "openai")
    temperature = 0.0  # Temperature is fixed at 0.0

    if provider == "openai":
        # Use OpenAI API key from environment variable
        api_key = getattr(settings, "OPENAI_API_KEY", None) or os.environ.get(
            "OPENAI_API_KEY"
        )
        if not api_key:
            return None, create_error_response(
                "OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.",
                status.HTTP_400_BAD_REQUEST,
            )

        # Use LLM model from environment variable with fallback to default
        model = getattr(settings, "LLM_MODEL", None) or os.environ.get(
            "LLM_MODEL", "gpt-4o-mini"
        )

        return (
            ChatOpenAI(
                model=model,
                api_key=SecretStr(api_key),
                temperature=temperature,
            ),
            None,
        )

    elif provider == "ollama":
        # Use Ollama LLM
        base_url = getattr(settings, "OLLAMA_BASE_URL", "http://host.docker.internal:11434")
        model = getattr(settings, "LLM_MODEL", "qwen3:8b")

        return (
            ChatOllama(
                model=model,
                base_url=base_url,
                temperature=temperature,
            ),
            None,
        )

    else:
        return None, create_error_response(
            f"Invalid LLM_PROVIDER: {provider}. Must be 'openai' or 'ollama'.",
            status.HTTP_400_BAD_REQUEST,
        )


def handle_langchain_exception(exception: Exception) -> Response:
    error_message = str(exception)

    if (
        "invalid_api_key" in error_message.lower()
        or "authentication" in error_message.lower()
    ):
        return create_error_response("Invalid API key", status.HTTP_401_UNAUTHORIZED)

    if "rate_limit" in error_message.lower():
        return create_error_response(
            "API rate limit reached", status.HTTP_429_TOO_MANY_REQUESTS
        )

    return create_error_response(
        f"OpenAI API error: {exception}",
        status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
