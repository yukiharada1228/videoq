"""
VideoQアプリケーション用のユーティリティ関数
"""

import logging
from typing import Dict, Any, Optional
from django.http import JsonResponse, HttpResponse
from django.core.exceptions import ValidationError as DjangoValidationError
from .exceptions import VideoQException

# ロガーの設定
logger = logging.getLogger("app")


class ErrorResponseHandler:
    """統一されたエラーレスポンス処理クラス"""

    @staticmethod
    def create_error_response(
        message: str,
        error_code: str = "GENERAL_ERROR",
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
        user_message: Optional[str] = None,
    ) -> JsonResponse:
        """
        統一されたエラーレスポンスを作成

        Args:
            message: 内部用エラーメッセージ
            error_code: エラーコード
            status_code: HTTPステータスコード
            details: 追加の詳細情報
            user_message: ユーザー向けメッセージ（Noneの場合はmessageを使用）

        Returns:
            JsonResponse: エラーレスポンス
        """
        response_data = {
            "success": False,
            "error": {
                "code": error_code,
                "message": user_message or message,
                "details": details or {},
            },
        }

        # ログ出力
        logger.error(
            f"Error response created: {error_code} - {message}",
            extra={
                "error_code": error_code,
                "status_code": status_code,
                "details": details,
            },
        )

        return JsonResponse(response_data, status=status_code)

    @staticmethod
    def handle_videoq_exception(exception: VideoQException) -> JsonResponse:
        """VideoQExceptionを処理してエラーレスポンスを作成"""
        return ErrorResponseHandler.create_error_response(
            message=exception.message,
            error_code=exception.error_code,
            status_code=500,
            details=exception.details,
        )

    @staticmethod
    def handle_validation_error(exception: DjangoValidationError) -> JsonResponse:
        """DjangoのValidationErrorを処理してエラーレスポンスを作成"""
        error_messages = []
        if hasattr(exception, "message_dict"):
            for field, messages in exception.message_dict.items():
                if isinstance(messages, list):
                    error_messages.extend([f"{field}: {msg}" for msg in messages])
                else:
                    error_messages.append(f"{field}: {messages}")
        else:
            error_messages = [str(exception)]

        return ErrorResponseHandler.create_error_response(
            message="Validation error occurred",
            error_code="VALIDATION_ERROR",
            status_code=400,
            details={"validation_errors": error_messages},
        )

    @staticmethod
    def handle_general_exception(exception: Exception) -> JsonResponse:
        """一般的な例外を処理してエラーレスポンスを作成"""
        logger.exception(f"Unexpected error occurred: {str(exception)}")

        return ErrorResponseHandler.create_error_response(
            message="An unexpected error occurred",
            error_code="INTERNAL_ERROR",
            status_code=500,
            user_message="システムエラーが発生しました。しばらく時間をおいて再度お試しください。",
        )


def log_operation(operation: str, user_id: Optional[int] = None, **kwargs):
    """
    操作ログを出力するヘルパー関数

    Args:
        operation: 操作名
        user_id: ユーザーID
        **kwargs: 追加のログ情報
    """
    logger.info(
        f"Operation: {operation}",
        extra={"operation": operation, "user_id": user_id, **kwargs},
    )


def log_error(error: str, user_id: Optional[int] = None, **kwargs):
    """
    エラーログを出力するヘルパー関数

    Args:
        error: エラーメッセージ
        user_id: ユーザーID
        **kwargs: 追加のログ情報
    """
    logger.error(
        f"Error: {error}", extra={"error": error, "user_id": user_id, **kwargs}
    )
