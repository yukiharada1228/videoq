"""
タスク処理の共通ユーティリティ（DRY原則・N+1問題対策）
"""

import logging
import os
import tempfile
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple

from app.models import Video
from django.db import transaction
from django.db.models import QuerySet

logger = logging.getLogger(__name__)


class VideoTaskManager:
    """動画タスク処理の共通管理クラス（DRY原則）"""

    @staticmethod
    def get_video_with_user(video_id: int) -> Tuple[Optional[Video], Optional[str]]:
        """
        動画とユーザー情報を一度に取得（N+1問題対策）

        Returns:
            (video, error_message)
        """
        try:
            video = Video.objects.select_related("user").get(id=video_id)
            return video, None
        except Video.DoesNotExist:
            error_msg = f"Video with id {video_id} not found"
            logger.error(error_msg)
            return None, error_msg
        except Exception as e:
            error_msg = f"Error fetching video: {e}"
            logger.error(error_msg)
            return None, error_msg

    @staticmethod
    def update_video_status(video: Video, status: str, error_message: str = "") -> bool:
        """
        動画のステータスを更新（DRY原則）

        Returns:
            bool: 更新成功かどうか
        """
        try:
            video.status = status
            video.error_message = error_message
            video.save(update_fields=["status", "error_message"])
            logger.info(f"Updated video {video.id} status to {status}")
            return True
        except Exception as e:
            logger.error(f"Failed to update video {video.id} status: {e}")
            return False

    @staticmethod
    def validate_video_for_processing(video: Video) -> Tuple[bool, Optional[str]]:
        """
        動画の処理可能性を検証（DRY原則）

        Returns:
            (is_valid, error_message)
        """
        if not video.file:
            return False, "Video file is not available"

        if not os.path.exists(video.file.path):
            return False, f"Video file not found: {video.file.path}"

        if not video.user.encrypted_openai_api_key:
            return False, "OpenAI API key is not configured"

        return True, None


class TemporaryFileManager:
    """一時ファイル管理の共通クラス（DRY原則）"""

    def __init__(self):
        self.temp_files: List[str] = []

    def create_temp_file(self, suffix: str = "", prefix: str = "temp_") -> str:
        """一時ファイルを作成して管理リストに追加"""
        temp_file = tempfile.NamedTemporaryFile(
            suffix=suffix, prefix=prefix, delete=False
        )
        temp_file.close()
        self.temp_files.append(temp_file.name)
        return temp_file.name

    def cleanup_all(self):
        """管理されている一時ファイルをすべて削除"""
        for temp_file in self.temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
                    logger.debug(f"Cleaned up temporary file: {temp_file}")
            except Exception as e:
                logger.warning(f"Error cleaning up temporary file {temp_file}: {e}")
        self.temp_files.clear()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup_all()


class BatchProcessor:
    """バッチ処理の共通クラス（N+1問題対策）"""

    @staticmethod
    def process_in_batches(
        items: List[Any], batch_size: int, process_func, *args, **kwargs
    ) -> List[Any]:
        """
        アイテムをバッチで処理（N+1問題対策）

        Args:
            items: 処理するアイテムのリスト
            batch_size: バッチサイズ
            process_func: 処理関数
            *args, **kwargs: 処理関数に渡す引数

        Returns:
            処理結果のリスト
        """
        results = []
        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            batch_results = process_func(batch, *args, **kwargs)
            results.extend(batch_results)
        return results

    @staticmethod
    @contextmanager
    def database_transaction():
        """データベーストランザクションのコンテキストマネージャー"""
        try:
            with transaction.atomic():
                yield
        except Exception as e:
            logger.error(f"Database transaction failed: {e}")
            raise


class ErrorHandler:
    """エラーハンドリングの共通クラス（DRY原則）"""

    @staticmethod
    def handle_task_error(
        error: Exception, video_id: int, task_instance=None, max_retries: int = 3
    ) -> None:
        """
        タスクエラーの共通処理（DRY原則・N+1問題対策）

        Args:
            error: 発生したエラー
            video_id: 動画ID
            task_instance: Celeryタスクインスタンス
            max_retries: 最大リトライ回数
        """
        logger.error(f"Error in task for video {video_id}: {error}", exc_info=True)

        # N+1問題対策: 動画ステータスをエラーに更新（select_relatedは不要）
        # DRY原則: VideoTaskManagerを使用
        try:
            video = Video.objects.only("id").get(id=video_id)
            VideoTaskManager.update_video_status(video, "error", str(error))
        except Exception as update_error:
            logger.error(f"Failed to update video status: {update_error}")

        # DRY原則: リトライ処理を共通化
        ErrorHandler._handle_retry_logic(task_instance, error, max_retries)

        raise error

    @staticmethod
    def _handle_retry_logic(task_instance, error: Exception, max_retries: int) -> None:
        """
        リトライ処理の共通ロジック（DRY原則）
        """
        if task_instance and task_instance.request.retries < max_retries:
            logger.info(
                f"Retrying task (attempt {task_instance.request.retries + 1}/{max_retries})"
            )
            task_instance.retry(
                exc=error, countdown=60 * (task_instance.request.retries + 1)
            )

    @staticmethod
    def safe_execute(func, *args, **kwargs):
        """
        安全な関数実行（DRY原則）

        Returns:
            (result, error)
        """
        try:
            result = func(*args, **kwargs)
            return result, None
        except Exception as e:
            logger.error(f"Error executing function {func.__name__}: {e}")
            return None, e

    @staticmethod
    def handle_database_error(error: Exception, operation: str) -> None:
        """
        データベースエラーの共通処理（DRY原則）
        """
        logger.error(f"Database error during {operation}: {error}", exc_info=True)
        raise error

    @staticmethod
    def validate_required_fields(data: dict, required_fields: list) -> tuple[bool, str]:
        """
        必須フィールドのバリデーション（DRY原則）

        Returns:
            (is_valid, error_message)
        """
        missing_fields = [
            field for field in required_fields if field not in data or not data[field]
        ]
        if missing_fields:
            return False, f"Missing required fields: {', '.join(missing_fields)}"
        return True, ""
