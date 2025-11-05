"""LangChain向けヘルパー"""

from typing import Tuple

from app.common.responses import create_error_response
from app.utils.encryption import decrypt_api_key
from django.contrib.auth import get_user_model
from langchain_openai import ChatOpenAI
from rest_framework import status
from rest_framework.response import Response

User = get_user_model()


def get_langchain_llm(user) -> Tuple[ChatOpenAI, Response]:
    if not user.encrypted_openai_api_key:
        return None, create_error_response(
            "OpenAI APIキーが設定されていません", status.HTTP_400_BAD_REQUEST
        )

    try:
        api_key = decrypt_api_key(user.encrypted_openai_api_key)
    except Exception as exc:
        return None, create_error_response(
            f"APIキーの復号化に失敗しました: {exc}",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
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
        return create_error_response("無効なAPIキーです", status.HTTP_401_UNAUTHORIZED)

    if "rate_limit" in error_message.lower():
        return create_error_response(
            "APIのレート制限に達しました", status.HTTP_429_TOO_MANY_REQUESTS
        )

    return create_error_response(
        f"OpenAI APIエラー: {exception}",
        status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
