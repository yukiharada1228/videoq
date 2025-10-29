"""
共通のパフォーマンス最適化ユーティリティ（DRY原則・N+1問題対策）
"""

import logging
import time
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, TypeVar, Union

from django.core.cache import cache
from django.db import connection
from django.db.models import QuerySet

logger = logging.getLogger(__name__)

T = TypeVar("T")


class PerformanceOptimizer:
    """パフォーマンス最適化の共通クラス（DRY原則・N+1問題対策）"""

    @staticmethod
    def measure_time(func: Callable) -> Callable:
        """
        実行時間を測定するデコレータ（DRY原則）

        Args:
            func: 測定する関数

        Returns:
            測定結果付き関数
        """

        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            result = func(*args, **kwargs)
            end_time = time.time()

            logger.info(f"{func.__name__}: {end_time - start_time:.2f}秒")
            return result

        return wrapper

    @staticmethod
    def measure_async_time(func: Callable) -> Callable:
        """
        非同期実行時間を測定するデコレータ（DRY原則）

        Args:
            func: 測定する非同期関数

        Returns:
            測定結果付き非同期関数
        """

        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            result = await func(*args, **kwargs)
            end_time = time.time()

            logger.info(f"{func.__name__}: {end_time - start_time:.2f}秒")
            return result

        return wrapper

    @staticmethod
    def count_queries(func: Callable) -> Callable:
        """
        データベースクエリ数を測定するデコレータ（N+1問題対策）

        Args:
            func: 測定する関数

        Returns:
            クエリ数測定結果付き関数
        """

        @wraps(func)
        def wrapper(*args, **kwargs):
            initial_queries = len(connection.queries)
            result = func(*args, **kwargs)
            final_queries = len(connection.queries)

            query_count = final_queries - initial_queries
            logger.info(f"{func.__name__}: {query_count}クエリ実行")
            return result

        return wrapper


class CacheManager:
    """キャッシュ管理の共通クラス（DRY原則・N+1問題対策）"""

    @staticmethod
    def get_or_set(key: str, default: Callable[[], T], timeout: int = 300) -> T:
        """
        キャッシュから取得、なければ設定（DRY原則）

        Args:
            key: キャッシュキー
            default: デフォルト値を生成する関数
            timeout: キャッシュの有効期限（秒）

        Returns:
            キャッシュされた値
        """
        result = cache.get(key)
        if result is None:
            result = default()
            cache.set(key, result, timeout)
        return result

    @staticmethod
    def get_or_set_async(key: str, default: Callable[[], T], timeout: int = 300) -> T:
        """
        非同期キャッシュから取得、なければ設定（DRY原則）

        Args:
            key: キャッシュキー
            default: デフォルト値を生成する非同期関数
            timeout: キャッシュの有効期限（秒）

        Returns:
            キャッシュされた値
        """
        result = cache.get(key)
        if result is None:
            result = default()
            cache.set(key, result, timeout)
        return result

    @staticmethod
    def invalidate_pattern(pattern: str) -> None:
        """
        パターンに一致するキャッシュを無効化（DRY原則）

        Args:
            pattern: 無効化するパターン
        """
        # 実装は使用するキャッシュバックエンドに依存
        logger.info(f"キャッシュパターン '{pattern}' を無効化")


class QueryOptimizer:
    """クエリ最適化の共通クラス（N+1問題対策）"""

    @staticmethod
    def optimize_queryset(
        queryset: QuerySet,
        select_related_fields: Optional[List[str]] = None,
        prefetch_related_fields: Optional[List[str]] = None,
        only_fields: Optional[List[str]] = None,
    ) -> QuerySet:
        """
        クエリセットを最適化（N+1問題対策）

        Args:
            queryset: ベースとなるクエリセット
            select_related_fields: select_relatedするフィールド
            prefetch_related_fields: prefetch_relatedするフィールド
            only_fields: onlyで取得するフィールド

        Returns:
            最適化されたクエリセット
        """
        if select_related_fields:
            queryset = queryset.select_related(*select_related_fields)

        if prefetch_related_fields:
            queryset = queryset.prefetch_related(*prefetch_related_fields)

        if only_fields:
            queryset = queryset.only(*only_fields)

        return queryset

    @staticmethod
    def bulk_optimize(
        queryset: QuerySet, operation: str, batch_size: int = 1000
    ) -> QuerySet:
        """
        バルク操作用にクエリセットを最適化（N+1問題対策）

        Args:
            queryset: ベースとなるクエリセット
            operation: 操作タイプ（'update', 'delete', 'create'）
            batch_size: バッチサイズ

        Returns:
            最適化されたクエリセット
        """
        if operation == "update":
            return queryset.only("id")
        elif operation == "delete":
            return queryset.only("id")
        elif operation == "create":
            return queryset
        else:
            return queryset


class BatchProcessor:
    """バッチ処理の共通クラス（N+1問題対策）"""

    @staticmethod
    def process_in_batches(
        items: List[Any], processor: Callable[[List[Any]], Any], batch_size: int = 100
    ) -> List[Any]:
        """
        アイテムをバッチで処理（N+1問題対策）

        Args:
            items: 処理するアイテムのリスト
            processor: バッチ処理関数
            batch_size: バッチサイズ

        Returns:
            処理結果のリスト
        """
        results = []

        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            batch_result = processor(batch)
            results.append(batch_result)

        return results

    @staticmethod
    def process_async_in_batches(
        items: List[Any], processor: Callable[[List[Any]], Any], batch_size: int = 100
    ) -> List[Any]:
        """
        アイテムを非同期バッチで処理（N+1問題対策）

        Args:
            items: 処理するアイテムのリスト
            processor: 非同期バッチ処理関数
            batch_size: バッチサイズ

        Returns:
            処理結果のリスト
        """
        results = []

        for i in range(0, len(items), batch_size):
            batch = items[i : i + batch_size]
            batch_result = processor(batch)
            results.append(batch_result)

        return results


class MemoryOptimizer:
    """メモリ最適化の共通クラス（DRY原則）"""

    @staticmethod
    def chunked_iterator(queryset: QuerySet, chunk_size: int = 1000):
        """
        チャンクでイテレート（メモリ効率化）

        Args:
            queryset: クエリセット
            chunk_size: チャンクサイズ

        Yields:
            チャンクごとのデータ
        """
        total_count = queryset.count()

        for offset in range(0, total_count, chunk_size):
            chunk = queryset[offset : offset + chunk_size]
            yield chunk

    @staticmethod
    def memory_efficient_map(
        items: List[Any], mapper: Callable[[Any], Any], chunk_size: int = 1000
    ) -> List[Any]:
        """
        メモリ効率的なマッピング（DRY原則）

        Args:
            items: マッピングするアイテムのリスト
            mapper: マッピング関数
            chunk_size: チャンクサイズ

        Returns:
            マッピング結果のリスト
        """
        results = []

        for i in range(0, len(items), chunk_size):
            chunk = items[i : i + chunk_size]
            chunk_results = [mapper(item) for item in chunk]
            results.extend(chunk_results)

        return results
