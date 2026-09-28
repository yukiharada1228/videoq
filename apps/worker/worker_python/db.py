"""PostgreSQL connection helper (psycopg v3)."""

from __future__ import annotations

import os
from collections.abc import Generator
from contextlib import closing, contextmanager
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
    """Commit on success, roll back on error, and always close the connection."""
    # Connection.__exit__ can raise during commit before it closes the connection.
    with closing(psycopg.connect(get_database_url(), row_factory=dict_row)) as conn, conn:
        yield conn
