"""
Tests for performance_utils module
"""

import time

from app.models import User
from app.utils.performance_utils import (CacheManager, MemoryOptimizer,
                                         PerformanceOptimizer)
from django.core.cache import cache
from django.test import TestCase


class PerformanceOptimizerTests(TestCase):
    """Tests for PerformanceOptimizer class"""

    def setUp(self):
        """Set up test data"""
        cache.clear()

    def test_measure_time_decorator(self):
        """Test measure_time decorator"""

        @PerformanceOptimizer.measure_time
        def test_function():
            time.sleep(0.01)
            return "result"

        result = test_function()
        self.assertEqual(result, "result")

    def test_measure_async_time_decorator(self):
        """Test measure_async_time decorator"""
        import asyncio

        @PerformanceOptimizer.measure_async_time
        async def test_async_function():
            await asyncio.sleep(0.01)
            return "async_result"

        result = asyncio.run(test_async_function())
        self.assertEqual(result, "async_result")

    def test_count_queries_decorator(self):
        """Test count_queries decorator"""

        @PerformanceOptimizer.count_queries
        def test_function():
            User.objects.create_user(
                username="testuser",
                email="test@example.com",
                password="testpass123",
            )
            return User.objects.count()

        result = test_function()
        self.assertGreater(result, 0)


class CacheManagerTests(TestCase):
    """Tests for CacheManager class"""

    def setUp(self):
        """Set up test data"""
        cache.clear()

    def test_get_or_set_with_cache_miss(self):
        """Test get_or_set when cache is empty"""

        def default_func():
            return "cached_value"

        result = CacheManager.get_or_set("test_key", default_func, timeout=300)
        self.assertEqual(result, "cached_value")
        self.assertEqual(cache.get("test_key"), "cached_value")

    def test_get_or_set_with_cache_hit(self):
        """Test get_or_set when cache exists"""
        cache.set("test_key", "existing_value", timeout=300)

        call_count = [0]

        def default_func():
            call_count[0] += 1
            return "new_value"

        result = CacheManager.get_or_set("test_key", default_func, timeout=300)
        self.assertEqual(result, "existing_value")
        self.assertEqual(call_count[0], 0)  # default_func should not be called

    def test_get_or_set_async_with_cache_miss(self):
        """Test get_or_set_async when cache is empty"""

        def default_func():
            return "async_cached_value"

        result = CacheManager.get_or_set_async(
            "test_key_async", default_func, timeout=300
        )
        self.assertEqual(result, "async_cached_value")
        self.assertEqual(cache.get("test_key_async"), "async_cached_value")

    def test_get_or_set_async_with_cache_hit(self):
        """Test get_or_set_async when cache exists"""
        cache.set("test_key_async", "existing_async_value", timeout=300)

        call_count = [0]

        def default_func():
            call_count[0] += 1
            return "new_async_value"

        result = CacheManager.get_or_set_async(
            "test_key_async", default_func, timeout=300
        )
        self.assertEqual(result, "existing_async_value")
        self.assertEqual(call_count[0], 0)  # default_func should not be called

    def test_invalidate_pattern(self):
        """Test invalidate_pattern method"""
        # This is a placeholder implementation, so we just test it doesn't crash
        CacheManager.invalidate_pattern("test_pattern")


class MemoryOptimizerTests(TestCase):
    """Tests for MemoryOptimizer class"""

    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_chunked_iterator(self):
        """Test chunked_iterator"""
        # Create multiple users
        for i in range(5):
            User.objects.create_user(
                username=f"user{i}",
                email=f"user{i}@example.com",
                password="testpass123",
            )

        queryset = User.objects.all()
        chunks = list(MemoryOptimizer.chunked_iterator(queryset, chunk_size=2))

        self.assertGreater(len(chunks), 0)
        total_items = sum(len(chunk) for chunk in chunks)
        self.assertEqual(total_items, User.objects.count())

    def test_chunked_iterator_with_empty_queryset(self):
        """Test chunked_iterator with empty queryset"""
        User.objects.exclude(username="testuser").delete()
        queryset = User.objects.filter(username="nonexistent")
        chunks = list(MemoryOptimizer.chunked_iterator(queryset, chunk_size=2))
        self.assertEqual(len(chunks), 0)

    def test_memory_efficient_map(self):
        """Test memory_efficient_map"""

        def mapper(x):
            return x * 2

        items = [1, 2, 3, 4, 5]
        result = MemoryOptimizer.memory_efficient_map(items, mapper, chunk_size=2)
        self.assertEqual(result, [2, 4, 6, 8, 10])

    def test_memory_efficient_map_with_empty_list(self):
        """Test memory_efficient_map with empty list"""

        def mapper(x):
            return x * 2

        items = []
        result = MemoryOptimizer.memory_efficient_map(items, mapper, chunk_size=2)
        self.assertEqual(result, [])

    def test_memory_efficient_map_with_single_chunk(self):
        """Test memory_efficient_map with items fitting in one chunk"""

        def mapper(x):
            return x * 2

        items = [1, 2]
        result = MemoryOptimizer.memory_efficient_map(items, mapper, chunk_size=10)
        self.assertEqual(result, [2, 4])
