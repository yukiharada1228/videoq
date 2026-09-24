import os
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock, call

import psycopg
import pytest
from psycopg import sql

from worker_python.tasks import account_deletion


@pytest.fixture
def deletion_db(monkeypatch):
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for PostgreSQL integration tests")
    schema = f"account_deletion_{uuid.uuid4().hex}"
    with psycopg.connect(database_url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            admin.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            admin.execute("""
                CREATE TABLE users (id text PRIMARY KEY);
                CREATE TABLE videos (
                    id integer PRIMARY KEY,
                    user_id text REFERENCES users(id) ON DELETE CASCADE,
                    file text
                );
                CREATE TABLE scene_embeddings (
                    video_id integer PRIMARY KEY, user_id text NOT NULL
                );
                CREATE TABLE chat_logs (
                    id integer PRIMARY KEY, user_id text REFERENCES users(id)
                );
                CREATE TABLE video_courses (
                    id integer PRIMARY KEY, user_id text REFERENCES users(id)
                );
                CREATE TABLE tags (
                    id integer PRIMARY KEY, user_id text REFERENCES users(id)
                );
                INSERT INTO users VALUES ('owner'), ('other');
                INSERT INTO videos VALUES
                    (10, 'owner', 'videos/owner/10.mp4'),
                    (11, 'owner', 'videos/owner/11.mp4'),
                    (20, 'other', 'videos/other/20.mp4');
                INSERT INTO scene_embeddings VALUES
                    (10, 'owner'), (11, 'owner'), (20, 'other'), (99, 'owner');
                INSERT INTO chat_logs VALUES (1, 'owner'), (2, 'other');
                INSERT INTO video_courses VALUES (1, 'owner'), (2, 'other');
                INSERT INTO tags VALUES (1, 'owner'), (2, 'other');
            """)
            monkeypatch.setenv("DATABASE_URL", psycopg.conninfo.make_conninfo(
                database_url, options=f"-c search_path={schema} -c statement_timeout=5000",
            ))
            monkeypatch.setenv("PGVECTOR_COLLECTION_NAME", "scene_embeddings")
            yield admin
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


@pytest.fixture
def storage_delete(monkeypatch):
    delete = MagicMock()
    monkeypatch.setattr(account_deletion, "delete_object", delete)
    return delete


def assert_remaining(conn, video_ids, vector_ids, user_ids):
    assert conn.execute("SELECT id FROM videos ORDER BY id").fetchall() == [
        (value,) for value in video_ids
    ]
    assert conn.execute("SELECT video_id FROM scene_embeddings ORDER BY video_id").fetchall() == [
        (value,) for value in vector_ids
    ]
    assert conn.execute("SELECT id FROM users ORDER BY id").fetchall() == [
        (value,) for value in user_ids
    ]


def test_deletion_commits_before_unlocking_each_video(deletion_db, storage_delete, monkeypatch):
    lock = account_deletion.video_vector_write_lock
    checked = []

    @contextmanager
    def checked_lock(video_id):
        with lock(video_id):
            yield
            # A waiting indexer must observe the deletion when this lock releases.
            assert deletion_db.execute(
                "SELECT id FROM videos WHERE id = %s", (video_id,),
            ).fetchone() is None
            assert deletion_db.execute(
                "SELECT video_id FROM scene_embeddings WHERE video_id = %s", (video_id,),
            ).fetchone() is None
            checked.append(video_id)

    monkeypatch.setattr(account_deletion, "video_vector_write_lock", checked_lock)
    account_deletion.delete_account_data("owner")
    assert checked == [10, 11]
    assert_remaining(deletion_db, [20], [20], ["other"])
    for table in ("chat_logs", "video_courses", "tags"):
        assert deletion_db.execute(
            sql.SQL("SELECT id FROM {}").format(sql.Identifier(table)),
        ).fetchall() == [(2,)]
    assert storage_delete.call_args_list == [
        call("videos/owner/10.mp4"), call("videos/owner/11.mp4"),
    ]
    account_deletion.delete_account_data("owner")
    assert storage_delete.call_count == 2


def test_reuses_the_write_connection_for_all_vector_deletes(deletion_db, storage_delete, monkeypatch):
    connect = MagicMock(wraps=psycopg.connect)
    monkeypatch.setattr(psycopg, "connect", connect)
    account_deletion.delete_account_data("owner")
    # One write connection, plus one advisory-lock connection per video.
    assert connect.call_count == 3
    assert_remaining(deletion_db, [20], [20], ["other"])


@pytest.mark.parametrize("failed_video", [10, 11])
def test_storage_failure_preserves_failed_video_and_vectors_for_retry(
    deletion_db, storage_delete, monkeypatch, failed_video,
):
    def fail_storage(key):
        if key == f"videos/owner/{failed_video}.mp4":
            raise RuntimeError("R2 unavailable")

    storage_delete.side_effect = fail_storage
    lock = account_deletion.video_vector_write_lock

    @contextmanager
    def checked_lock(video_id):
        with lock(video_id):
            try:
                yield
            except RuntimeError:
                # Rollback must finish before another vector writer is admitted.
                with deletion_db.transaction():
                    deletion_db.execute("SET LOCAL lock_timeout = '1s'")
                    assert deletion_db.execute(
                        "SELECT id FROM videos WHERE id = %s FOR UPDATE", (video_id,),
                    ).fetchone() == (video_id,)
                assert deletion_db.execute(
                    "SELECT video_id FROM scene_embeddings WHERE video_id = %s", (video_id,),
                ).fetchone() == (video_id,)
                raise

    monkeypatch.setattr(account_deletion, "video_vector_write_lock", checked_lock)
    with pytest.raises(RuntimeError, match="R2 unavailable"):
        account_deletion.delete_account_data("owner")
    remaining = [10, 11, 20] if failed_video == 10 else [11, 20]
    assert_remaining(deletion_db, remaining, [*remaining, 99], ["other", "owner"])
    storage_delete.reset_mock(side_effect=True)
    account_deletion.delete_account_data("owner")
    assert storage_delete.call_args_list == [
        call(f"videos/owner/{video_id}.mp4") for video_id in remaining if video_id != 20
    ]
    assert_remaining(deletion_db, [20], [20], ["other"])


@pytest.mark.parametrize("table,column,failed_video", [
    ("scene_embeddings", "video_id", 11),
    ("videos", "id", 10),
])
def test_database_failure_rolls_back_video_and_vector_deletion(
    deletion_db, storage_delete, table, column, failed_video,
):
    deletion_db.execute(sql.SQL("""
        CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.{} = {} THEN RAISE EXCEPTION 'injected deletion failure'; END IF;
            RETURN OLD;
        END $$;
        CREATE TRIGGER reject_delete BEFORE DELETE ON {}
        FOR EACH ROW EXECUTE FUNCTION reject_delete();
    """).format(sql.Identifier(column), sql.Literal(failed_video), sql.Identifier(table)))
    with pytest.raises(psycopg.errors.RaiseException, match="injected deletion failure"):
        account_deletion.delete_account_data("owner")
    remaining = [10, 11, 20] if failed_video == 10 else [11, 20]
    assert_remaining(deletion_db, remaining, [*remaining, 99], ["other", "owner"])
    assert storage_delete.call_args_list == (
        [] if failed_video == 10 else [call("videos/owner/10.mp4")]
    )
    deletion_db.execute(sql.SQL("DROP TRIGGER reject_delete ON {}").format(sql.Identifier(table)))
    storage_delete.reset_mock()
    account_deletion.delete_account_data("owner")
    assert_remaining(deletion_db, [20], [20], ["other"])


@pytest.mark.parametrize("change", ["transfer", "remove", "file"])
def test_rechecks_owner_and_file_after_acquiring_lock(
    deletion_db, storage_delete, monkeypatch, change,
):
    lock = account_deletion.video_vector_write_lock

    @contextmanager
    def changed_lock(video_id):
        if video_id == 10:
            if change == "transfer":
                deletion_db.execute("UPDATE videos SET user_id = 'other' WHERE id = 10")
                deletion_db.execute("UPDATE scene_embeddings SET user_id = 'other' WHERE video_id = 10")
            elif change == "remove":
                deletion_db.execute("DELETE FROM videos WHERE id = 10")
            else:
                deletion_db.execute("UPDATE videos SET file = 'videos/owner/current.mp4' WHERE id = 10")
        with lock(video_id):
            yield

    monkeypatch.setattr(account_deletion, "video_vector_write_lock", changed_lock)
    account_deletion.delete_account_data("owner")
    remaining = [10, 20] if change == "transfer" else [20]
    assert_remaining(deletion_db, remaining, remaining, ["other"])
    expected = [call("videos/owner/11.mp4")]
    if change == "file":
        expected.insert(0, call("videos/owner/current.mp4"))
    assert storage_delete.call_args_list == expected


def test_empty_file_keys_do_not_call_storage(deletion_db, storage_delete):
    deletion_db.execute("UPDATE videos SET file = NULL WHERE id = 10")
    deletion_db.execute("UPDATE videos SET file = '' WHERE id = 11")
    account_deletion.delete_account_data("owner")
    storage_delete.assert_not_called()
    assert_remaining(deletion_db, [20], [20], ["other"])


def test_commit_failure_rolls_back_before_unlocking_and_allows_retry(
    deletion_db, storage_delete, monkeypatch,
):
    deletion_db.execute("""
        CREATE FUNCTION reject_commit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected commit failure'; END $$;
        CREATE CONSTRAINT TRIGGER reject_commit AFTER DELETE ON videos
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION reject_commit();
    """)
    lock = account_deletion.video_vector_write_lock
    checked = []

    @contextmanager
    def checked_lock(video_id):
        with lock(video_id):
            try:
                yield
            except psycopg.errors.RaiseException:
                with deletion_db.transaction():
                    deletion_db.execute("SET LOCAL lock_timeout = '1s'")
                    assert deletion_db.execute(
                        "SELECT id FROM videos WHERE id = %s FOR UPDATE", (video_id,),
                    ).fetchone() == (video_id,)
                assert_remaining(deletion_db, [10, 11, 20], [10, 11, 20, 99], ["other", "owner"])
                checked.append(video_id)
                raise

    monkeypatch.setattr(account_deletion, "video_vector_write_lock", checked_lock)
    with pytest.raises(psycopg.errors.RaiseException, match="injected commit failure"):
        account_deletion.delete_account_data("owner")
    assert checked == [10]
    storage_delete.assert_called_once_with("videos/owner/10.mp4")
    deletion_db.execute("DROP TRIGGER reject_commit ON videos")
    account_deletion.delete_account_data("owner")
    assert_remaining(deletion_db, [20], [20], ["other"])
    assert storage_delete.call_args_list == [
        call("videos/owner/10.mp4"), call("videos/owner/10.mp4"), call("videos/owner/11.mp4"),
    ]
