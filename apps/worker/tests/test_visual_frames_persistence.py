import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import psycopg
from psycopg import sql
import pytest

from worker_python.pipeline import visual_frames, focus_frames


@pytest.fixture
def visual_db(monkeypatch):
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL is required")
    schema = f"visual_frames_{uuid.uuid4().hex}"
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            conn.execute("CREATE TABLE videos (id integer PRIMARY KEY, file text, source_type text)")
            conn.execute("INSERT INTO videos VALUES (42, 'video.mp4', 'uploaded')")
            monkeypatch.setenv("DATABASE_URL", psycopg.conninfo.make_conninfo(
                url, options=f"-c search_path={schema} -c statement_timeout=5000",
            ))
            yield conn
        finally:
            conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


@pytest.mark.parametrize("change", ["delete", "replace"])
@pytest.mark.parametrize("dense", [False, True])
def test_no_late_cache_publication_after_concurrent_deletion_or_replacement(visual_db, monkeypatch, tmp_path, change, dense):
    published = []
    monkeypatch.setattr(visual_frames, "upload_bytes", lambda *args: published.append(args))
    monkeypatch.setattr(focus_frames, "upload_file", lambda *args: published.append(args))
    pack = tmp_path / "focus.bin"
    pack.write_bytes(b"x" * 20)
    with ThreadPoolExecutor(max_workers=1) as executor:
        # Hold the same row lock used by API/account deletion while a cache
        # writer starts. It must recheck the committed state after this releases.
        with visual_db.transaction():
            visual_db.execute("SELECT id FROM videos WHERE id = 42 FOR UPDATE")
            future = executor.submit(focus_frames.publish_focus_cache if dense else visual_frames.publish_frame_cache,
                                     42, "video.mp4", pack if dense else b"cache")
            if change == "delete":
                visual_db.execute("DELETE FROM videos WHERE id = 42")
            else:
                visual_db.execute("UPDATE videos SET file = 'replacement.mp4' WHERE id = 42")
        assert future.result(timeout=5) is False
    assert published == []
