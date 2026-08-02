"""PostgreSQL connection helper (psycopg v3)."""

from __future__ import annotations

import os
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required")
    return url


@contextmanager
def db_connection() -> Generator[psycopg.Connection[Any], None, None]:
    """Yield a connection with autocommit disabled (explicit commit/rollback)."""
    with psycopg.connect(get_database_url(), row_factory=dict_row) as conn:
        yield conn


@contextmanager
def db_transaction() -> Generator[psycopg.Connection[Any], None, None]:
    """Yield a connection wrapped in a transaction (commit on success)."""
    with db_connection() as conn:
        with conn.transaction():
            yield conn
