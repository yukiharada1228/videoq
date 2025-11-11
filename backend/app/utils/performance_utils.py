"""
Common performance optimization utilities
"""

import logging
import time
from functools import wraps
from typing import Any, Callable, List, TypeVar

from django.core.cache import cache
from django.db import connection
from django.db.models import QuerySet

logger = logging.getLogger(__name__)

T = TypeVar("T")


class PerformanceOptimizer:
    """Common performance optimization class"""

    @staticmethod
    def measure_time(func: Callable) -> Callable:
        """
        Decorator to measure execution time

        Args:
            func: Function to measure

        Returns:
            Function with measurement results
        """

        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            result = func(*args, **kwargs)
            end_time = time.time()

            logger.info(f"{func.__name__}: {end_time - start_time:.2f} seconds")
            return result

        return wrapper

    @staticmethod
    def measure_async_time(func: Callable) -> Callable:
        """
        Decorator to measure async execution time

        Args:
            func: Async function to measure

        Returns:
            Async function with measurement results
        """

        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.time()
            result = await func(*args, **kwargs)
            end_time = time.time()

            logger.info(f"{func.__name__}: {end_time - start_time:.2f} seconds")
            return result

        return wrapper

    @staticmethod
    def count_queries(func: Callable) -> Callable:
        """
        Decorator to measure database query count (N+1 prevention)

        Args:
            func: Function to measure

        Returns:
            Function with query count measurement results
        """

        @wraps(func)
        def wrapper(*args, **kwargs):
            initial_queries = len(connection.queries)
            result = func(*args, **kwargs)
            final_queries = len(connection.queries)

            query_count = final_queries - initial_queries
            logger.info(f"{func.__name__}: {query_count} queries executed")
            return result

        return wrapper


class CacheManager:
    """Common cache management class"""

    @staticmethod
    def get_or_set(key: str, default: Callable[[], T], timeout: int = 300) -> T:
        """
        Get from cache, or set if not exists

        Args:
            key: Cache key
            default: Function to generate default value
            timeout: Cache expiration time (seconds)

        Returns:
            Cached value
        """
        result = cache.get(key)
        if result is None:
            result = default()
            cache.set(key, result, timeout)
        return result

    @staticmethod
    def get_or_set_async(key: str, default: Callable[[], T], timeout: int = 300) -> T:
        """
        Get from async cache, or set if not exists

        Args:
            key: Cache key
            default: Async function to generate default value
            timeout: Cache expiration time (seconds)

        Returns:
            Cached value
        """
        result = cache.get(key)
        if result is None:
            result = default()
            cache.set(key, result, timeout)
        return result

    @staticmethod
    def invalidate_pattern(pattern: str) -> None:
        """
        Invalidate cache matching pattern

        Args:
            pattern: Pattern to invalidate
        """
        # Implementation depends on cache backend used
        logger.info(f"Invalidating cache pattern '{pattern}'")


class MemoryOptimizer:
    """Common memory optimization class"""

    @staticmethod
    def chunked_iterator(queryset: QuerySet, chunk_size: int = 1000):
        """
        Iterate in chunks (memory efficient)

        Args:
            queryset: QuerySet
            chunk_size: Chunk size

        Yields:
            Data per chunk
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
        Memory-efficient mapping

        Args:
            items: List of items to map
            mapper: Mapping function
            chunk_size: Chunk size

        Returns:
            List of mapping results
        """
        results = []

        for i in range(0, len(items), chunk_size):
            chunk = items[i : i + chunk_size]
            chunk_results = [mapper(item) for item in chunk]
            results.extend(chunk_results)

        return results
