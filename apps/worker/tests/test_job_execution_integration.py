from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg
import pytest

from worker_python.job_execution import (
    JobExecutionBusyError,
    claim_job_execution,
    complete_job_execution,
)


def _scoped_database_url(database_url: str, schema_name: str) -> str:
    parts = urlsplit(database_url)
    query = dict(parse_qsl(parts.query))
    query["options"] = f"-csearch_path={schema_name}"
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL is required for PostgreSQL integration tests",
)
def test_same_job_id_has_one_concurrent_owner(monkeypatch) -> None:
    database_url = os.environ["DATABASE_URL"]
    schema_name = f"job_execution_{uuid.uuid4().hex}"
    quoted_schema = f'"{schema_name}"'
    job_id = f"integration-{uuid.uuid4()}"
    payload = {"video_id": 42}

    with psycopg.connect(database_url, autocommit=True) as admin:
        admin.execute(f"CREATE SCHEMA {quoted_schema}")
        admin.execute(
            f"""
            CREATE TABLE {quoted_schema}.job_executions (
                job_id varchar(128) PRIMARY KEY,
                job_type varchar(64) NOT NULL,
                payload_sha256 varchar(64) NOT NULL,
                status varchar(16) NOT NULL,
                attempts integer NOT NULL DEFAULT 0,
                lease_token varchar(36),
                lease_until timestamptz,
                completed_at timestamptz,
                last_error text NOT NULL DEFAULT '',
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
    monkeypatch.setenv("DATABASE_URL", _scoped_database_url(database_url, schema_name))

    def claim():
        try:
            return claim_job_execution(job_id, "build_plog", payload)
        except JobExecutionBusyError:
            return "busy"

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: claim(), range(2)))

        tokens = [result for result in results if result not in {None, "busy"}]
        assert len(tokens) == 1
        assert results.count("busy") == 1

        complete_job_execution(job_id, tokens[0])
        assert claim_job_execution(job_id, "build_plog", payload) is None
    finally:
        with psycopg.connect(database_url, autocommit=True) as admin:
            admin.execute(f"DROP SCHEMA IF EXISTS {quoted_schema} CASCADE")
