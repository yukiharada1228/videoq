"""PLOG provider requests must not hold idle database connections."""

from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from worker_python.pipeline import plog_build
from worker_python.tasks import build_plog


@pytest.mark.parametrize("failure", [None, "extract", "schema", "embed", "save", "finish"])
def test_plog_releases_connections_before_provider_requests(monkeypatch, failure):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    active = []
    connections = []
    provider_connections = []

    @contextmanager
    def connection():
        conn = MagicMock()
        cursor = MagicMock()
        cursor.fetchone.return_value = {"id": 1, "transcript": "Lecture"}

        def execute(statement, *_):
            if failure == "save" and "DELETE FROM plog_edges" in statement:
                raise RuntimeError("save failed")
            return cursor

        conn.execute.side_effect = execute
        connections.append(conn)
        active.append(conn)
        try:
            yield conn
        except Exception:
            conn.rollback()
            raise
        finally:
            active.remove(conn)
            conn.close()

    monkeypatch.setattr(build_plog, "db_connection", connection)
    monkeypatch.setattr(plog_build, "db_connection", connection)
    monkeypatch.setattr(build_plog, "_claim_build_job", lambda *_: 7)

    def extract(*_):
        provider_connections.append(len(active))
        if failure == "extract":
            raise RuntimeError("extract failed")
        return [{"label": "Evaporation"}]

    def schema(*_):
        assert len(active) == 1
        if failure == "schema":
            raise RuntimeError("schema failed")

    def embed(_):
        provider_connections.append(len(active))
        if failure == "embed":
            raise RuntimeError("embed failed")
        return [[1.0]]

    def finish(conn, _job_id, *, status, **_):
        assert active == [conn]
        if status == "ready" and failure == "finish":
            raise RuntimeError("finish failed")

    monkeypatch.setattr(plog_build, "_extract_concepts", extract)
    monkeypatch.setattr(plog_build, "assert_embedding_schema", schema)
    monkeypatch.setattr(plog_build, "embed_texts", embed)
    update = MagicMock(side_effect=finish)
    monkeypatch.setattr(build_plog, "_finish_build_job", update)

    if failure:
        with pytest.raises(RuntimeError, match=f"{failure} failed"):
            build_plog.build_plog_artifacts(42)
        assert update.call_args.kwargs["status"] == "failed"
    else:
        build_plog.build_plog_artifacts(42)
        update.assert_called_once_with(connections[-1], 7, status="ready")

    assert provider_connections == ([0] if failure in {"extract", "schema"} else [0, 0])
    assert not active
    for conn in connections:
        conn.close.assert_called_once()
    if failure in {"save", "finish"}:
        connections[-2].rollback.assert_called_once()
        connections[-2].commit.assert_not_called()
