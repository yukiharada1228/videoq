import os
import uuid
from pathlib import Path
from unittest.mock import MagicMock

import psycopg
import pytest
from psycopg import sql

from worker_python.video_sql import delete_video_cascade

RELATED_TABLES = (
    "plog_build_jobs",
    "plog_summary_nodes",
    "plog_concepts",
    "plog_edges",
    "plog_learning_objects",
    "learner_concept_states",
    "video_tags",
    "video_course_members",
)
FIXTURE = Path(__file__).resolve().parents[2] / "api/test/fixtures/video-deletion.sql"


@pytest.fixture
def deletion_db():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for PostgreSQL integration tests")
    schema = f"worker_video_deletion_{uuid.uuid4().hex}"
    with psycopg.connect(database_url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            with psycopg.connect(
                database_url, options=f"-c search_path={schema}"
            ) as conn:
                conn.execute(FIXTURE.read_text())
                conn.commit()
                yield conn
        finally:
            admin.execute(
                sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
            )


def assert_intact(conn):
    assert conn.execute("SELECT id FROM videos ORDER BY id").fetchall() == [
        (10,),
        (20,),
    ]
    for table in RELATED_TABLES:
        expected = [(1,), (2,), (3,)] if table == "plog_summary_nodes" else [(1,), (2,)]
        assert (
            conn.execute(
                sql.SQL("SELECT id FROM {} ORDER BY id").format(sql.Identifier(table))
            ).fetchall()
            == expected
        )


def test_deletes_owned_video_and_related_rows_in_one_statement(deletion_db):
    tracked = MagicMock(wraps=deletion_db)
    delete_video_cascade(tracked, 10, "owner")
    tracked.execute.assert_called_once()
    deletion_db.commit()
    assert deletion_db.execute("SELECT id FROM videos").fetchall() == [(20,)]
    for table in RELATED_TABLES:
        assert deletion_db.execute(
            sql.SQL("SELECT id FROM {}").format(sql.Identifier(table))
        ).fetchall() == [(2,)]
    # The caller deletes vectors in the same transaction under the vector lock.
    assert deletion_db.execute(
        "SELECT id FROM scene_embeddings ORDER BY id"
    ).fetchall() == [(1,), (2,)]


@pytest.mark.parametrize("video_id,user_id", [(10, "outsider"), (99, "owner")])
def test_wrong_owner_or_missing_video_preserves_related_rows(
    deletion_db, video_id, user_id
):
    delete_video_cascade(deletion_db, video_id, user_id)
    deletion_db.commit()
    assert_intact(deletion_db)


def test_video_deletion_and_cascades_roll_back_together(deletion_db):
    delete_video_cascade(deletion_db, 10, "owner")
    deletion_db.rollback()
    assert_intact(deletion_db)
