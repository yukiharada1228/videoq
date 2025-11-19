"""LangChain helper functions"""

from typing import Tuple

from app.common.responses import create_error_response
from django.conf import settings
from django.contrib.auth import get_user_model
from langchain_openai import ChatOpenAI
from rest_framework import status
from rest_framework.response import Response

User = get_user_model()


def get_langchain_llm(user) -> Tuple[ChatOpenAI, Response]:
    # Use system OpenAI API key from environment variable
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        return None, create_error_response(
            "OpenAI API key is not configured", status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return (
        ChatOpenAI(
            model="gpt-4o-mini",
            api_key=api_key,
            temperature=0.7,
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
