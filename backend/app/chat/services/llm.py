"""LangChain helper functions"""

import os
from typing import Optional, Tuple

from django.conf import settings
from django.contrib.auth import get_user_model
from langchain_openai import ChatOpenAI
from pydantic import SecretStr
from rest_framework import status
from rest_framework.response import Response

from app.common.responses import create_error_response

User = get_user_model()


def get_langchain_llm(user) -> Tuple[Optional[ChatOpenAI], Optional[Response]]:
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

    # Temperature is fixed at 0.0
    temperature = 0.0

    return (
        ChatOpenAI(
            model=model,
            api_key=SecretStr(api_key),
            temperature=temperature,
        ),
        None,
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
