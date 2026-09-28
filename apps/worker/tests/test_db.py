from __future__ import annotations

import os
import uuid

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from worker_python.db import db_connection


@pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL is required")
@pytest.mark.parametrize("failure", [None, "application", "commit"])
def test_connection_commits_or_rolls_back_and_always_closes(monkeypatch, failure):
    database_url = os.environ["DATABASE_URL"]
    schema = f"connection_{uuid.uuid4().hex}"
    with psycopg.connect(database_url, autocommit=True) as observer:
        observer.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            observer.execute(sql.SQL("""
                CREATE TABLE {}.writes (
                    id integer PRIMARY KEY DEFERRABLE INITIALLY DEFERRED
                )
            """).format(sql.Identifier(schema)))
            monkeypatch.setenv("DATABASE_URL", make_conninfo(database_url, options=f"-csearch_path={schema}"))
            opened = []

            def write():
                with db_connection() as conn:
                    opened.append(conn)
                    conn.execute("INSERT INTO writes VALUES (1)")
                    if failure == "application":
                        raise RuntimeError("application failed")
                    if failure == "commit":
                        # The insert succeeds; its deferred constraint fails on commit.
                        conn.execute("INSERT INTO writes VALUES (1)")

            try:
                if failure == "application":
                    with pytest.raises(RuntimeError, match="application failed"):
                        write()
                elif failure == "commit":
                    with pytest.raises(psycopg.errors.UniqueViolation):
                        write()
                else:
                    write()
                assert observer.execute(sql.SQL("SELECT count(*) FROM {}.writes").format(
                    sql.Identifier(schema)
                )).fetchone()[0] == (0 if failure else 1)
                assert len(opened) == 1
                assert opened[0].closed
            finally:
                for conn in opened:
                    conn.close()
        finally:
            observer.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
