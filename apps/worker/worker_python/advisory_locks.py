"""PostgreSQL advisory locks for vector writes across Lambda instances."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import psycopg

from worker_python.db import db_connection

FULL_VECTOR_WRITE_LOCK_ID = 0x564944454F51


@contextmanager
def video_vector_write_lock(video_id: int) -> Iterator[None]:
    """Serialize one video's vectors while allowing different videos in parallel."""
    lock_name = f"videoq:vector:video:{video_id}"
    with db_connection() as conn:
        conn.execute(
            "SELECT pg_advisory_lock_shared(%s)",
            (FULL_VECTOR_WRITE_LOCK_ID,),
        )
        try:
            conn.execute(
                "SELECT pg_advisory_lock(hashtextextended(%s, 0))",
                (lock_name,),
            )
            try:
                yield
            finally:
                conn.execute(
                    "SELECT pg_advisory_unlock(hashtextextended(%s, 0))",
                    (lock_name,),
                )
        finally:
            conn.execute(
                "SELECT pg_advisory_unlock_shared(%s)",
                (FULL_VECTOR_WRITE_LOCK_ID,),
            )


@contextmanager
def full_vector_write_lock() -> Iterator[psycopg.Connection[Any]]:
    """Wait for, then exclude, every per-video vector writer."""
    with db_connection() as conn:
        conn.execute(
            "SELECT pg_advisory_lock(%s)",
            (FULL_VECTOR_WRITE_LOCK_ID,),
        )
        try:
            yield conn
        finally:
            conn.execute(
                "SELECT pg_advisory_unlock(%s)",
                (FULL_VECTOR_WRITE_LOCK_ID,),
            )
