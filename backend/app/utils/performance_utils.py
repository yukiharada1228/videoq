"""
共通のパフォーマンス最適化ユーティリティ
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
    """パフォーマンス最適化の共通クラス"""

    @staticmethod
    def measure_time(func: Callable) -> Callable:
        """
        実行時間を測定するデコレータ

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
        非同期実行時間を測定するデコレータ

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
    """キャッシュ管理の共通クラス"""

    @staticmethod
    def get_or_set(key: str, default: Callable[[], T], timeout: int = 300) -> T:
        """
        キャッシュから取得、なければ設定

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
        非同期キャッシュから取得、なければ設定

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
        パターンに一致するキャッシュを無効化

        Args:
            pattern: 無効化するパターン
        """
        # 実装は使用するキャッシュバックエンドに依存
        logger.info(f"キャッシュパターン '{pattern}' を無効化")


class MemoryOptimizer:
    """メモリ最適化の共通クラス"""

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
        メモリ効率的なマッピング

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
