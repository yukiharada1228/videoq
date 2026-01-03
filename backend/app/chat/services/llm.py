"""LangChain helper functions"""

from typing import Tuple

from django.contrib.auth import get_user_model
from langchain_openai import ChatOpenAI
from rest_framework import status
from rest_framework.response import Response

from app.common.responses import create_error_response
from app.utils.openai_utils import (OpenAIApiKeyNotConfiguredError,
                                    get_openai_api_key)

User = get_user_model()


def get_langchain_llm(user) -> Tuple[ChatOpenAI, Response]:
    # Use user's OpenAI API key
    try:
        api_key = get_openai_api_key(user)
        if not api_key:
            return None, create_error_response(
                "OpenAI API key is not configured. Please set your API key in settings.",
                status.HTTP_400_BAD_REQUEST,
            )
    except OpenAIApiKeyNotConfiguredError as e:
        return None, create_error_response(str(e), status.HTTP_400_BAD_REQUEST)

    # Use user's preferred settings with fallback to defaults
    model = getattr(user, "preferred_llm_model", "gpt-4o-mini") or "gpt-4o-mini"
    temperature = getattr(user, "preferred_llm_temperature", 0)
    if temperature is None:
        temperature = 0

    return (
        ChatOpenAI(
            model=model,
            api_key=api_key,
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
