"""
共通のレスポンス処理ユーティリティ
"""

from typing import Any, Dict, List, Optional, Union

from rest_framework import status
from rest_framework.response import Response


class ResponseBuilder:
    """レスポンス構築の共通クラス"""

    @staticmethod
    def success(
        data: Any = None,
        message: str = "操作が正常に完了しました",
        status_code: int = status.HTTP_200_OK,
        meta: Optional[Dict[str, Any]] = None,
    ) -> Response:
        """
        成功レスポンスを構築

        Args:
            data: レスポンスデータ
            message: メッセージ
            status_code: HTTPステータスコード
            meta: メタデータ

        Returns:
            構築されたレスポンス
        """
        response_data = {
            "success": True,
            "message": message,
            "data": data,
        }

        if meta:
            response_data["meta"] = meta

        return Response(response_data, status=status_code)

    @staticmethod
    def error(
        message: str = "エラーが発生しました",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        errors: Optional[Dict[str, List[str]]] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> Response:
        """
        エラーレスポンスを構築

        Args:
            message: エラーメッセージ
            status_code: HTTPステータスコード
            errors: バリデーションエラー
            details: 詳細情報

        Returns:
            構築されたレスポンス
        """
        response_data = {
            "success": False,
            "message": message,
        }

        if errors:
            response_data["errors"] = errors

        if details:
            response_data["details"] = details

        return Response(response_data, status=status_code)

    @staticmethod
    def paginated(
        data: List[Any],
        page: int,
        page_size: int,
        total_count: int,
        message: str = "データを正常に取得しました",
    ) -> Response:
        """
        ページネーション付きレスポンスを構築

        Args:
            data: データリスト
            page: 現在のページ
            page_size: ページサイズ
            total_count: 総件数
            message: メッセージ

        Returns:
            構築されたレスポンス
        """
        total_pages = (total_count + page_size - 1) // page_size

        meta = {
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            }
        }

        return ResponseBuilder.success(data=data, message=message, meta=meta)


class ValidationHelper:
    """バリデーションの共通ヘルパー"""

    @staticmethod
    def validate_required_fields(
        data: Dict[str, Any], required_fields: List[str]
    ) -> tuple[bool, Optional[Dict[str, List[str]]]]:
        """
        必須フィールドのバリデーション

        Args:
            data: バリデーションするデータ
            required_fields: 必須フィールドのリスト

        Returns:
            (is_valid, errors)
        """
        errors = {}

        for field in required_fields:
            if field not in data or not data[field]:
                errors[field] = [f"{field}は必須です"]

        return len(errors) == 0, errors if errors else None

    @staticmethod
    def validate_field_length(
        data: Dict[str, Any],
        field: str,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
    ) -> Optional[str]:
        """
        フィールドの長さをバリデーション

        Args:
            data: バリデーションするデータ
            field: フィールド名
            min_length: 最小長
            max_length: 最大長

        Returns:
            エラーメッセージ（エラーがない場合はNone）
        """
        if field not in data:
            return None

        value = str(data[field])

        if min_length is not None and len(value) < min_length:
            return f"{field}は{min_length}文字以上で入力してください"

        if max_length is not None and len(value) > max_length:
            return f"{field}は{max_length}文字以下で入力してください"

        return None

    @staticmethod
    def validate_email_format(email: str) -> bool:
        """
        メールアドレスの形式をバリデーション

        Args:
            email: メールアドレス

        Returns:
            有効な場合はTrue
        """
        import re

        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return re.match(pattern, email) is not None


class CacheHelper:
    """キャッシュの共通ヘルパー"""

    @staticmethod
    def get_cache_key(prefix: str, *args: Any) -> str:
        """
        キャッシュキーを生成

        Args:
            prefix: プレフィックス
            *args: キーの要素

        Returns:
            生成されたキャッシュキー
        """
        key_parts = [prefix] + [str(arg) for arg in args]
        return ":".join(key_parts)

    @staticmethod
    def get_user_cache_key(user_id: int, resource: str) -> str:
        """
        ユーザー固有のキャッシュキーを生成

        Args:
            user_id: ユーザーID
            resource: リソース名

        Returns:
            生成されたキャッシュキー
        """
        return CacheHelper.get_cache_key("user", user_id, resource)

    @staticmethod
    def get_resource_cache_key(resource: str, resource_id: int) -> str:
        """
        リソース固有のキャッシュキーを生成

        Args:
            resource: リソース名
            resource_id: リソースID

        Returns:
            生成されたキャッシュキー
        """
        return CacheHelper.get_cache_key("resource", resource, resource_id)
