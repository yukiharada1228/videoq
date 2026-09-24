from __future__ import annotations

import json
import os
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import psycopg
from psycopg import sql

from worker_python import lambda_handler
from worker_python.pipeline import plog_build, srt
from worker_python.tasks import build_plog


@pytest.fixture
def extraction(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    client = MagicMock()
    client.__enter__.return_value = client
    monkeypatch.setattr("openai.OpenAI", MagicMock(return_value=client))

    def respond(content):
        client.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )

    respond('{"concepts":[]}')
    return client, respond


def test_explicit_empty_inventory_is_valid(extraction) -> None:
    assert plog_build._extract_concepts("This is a recording test.") == []


@pytest.mark.parametrize("newline", ["\n", "\r\n", "\r"])
def test_plog_parses_only_the_first_40_valid_scenes(extraction, monkeypatch, newline) -> None:
    client, _ = extraction
    blocks = []
    expected_summaries = []
    for index in range(65):
        # Invalid cues must not consume the 40-scene prompt budget.
        blocks.append("invalid\nnot a time range\nignored")
        start = srt.format_srt_time(index)
        end = srt.format_srt_time(index + 1)
        text = f"Scene {index}: " + "字幕😀" * 100
        blocks.append(f"{index + 1}\n{start} --> {end}\n{text}")
        if index < 40:
            expected_summaries.append(f"[{start}-{end}] {text[:200]}")
    transcript = "\n \t\n".join(blocks).replace("\n", newline)
    parse_timestamp = MagicMock(wraps=srt.parse_srt_timestamp)
    monkeypatch.setattr(srt, "parse_srt_timestamp", parse_timestamp)

    assert plog_build.generate_plog_artifacts(42, transcript) == plog_build.PlogArtifacts([], [])

    prompt = client.chat.completions.create.call_args.kwargs["messages"][0]["content"]
    scene_text, transcript_head = prompt.split("Scenes:\n", 1)[1].split("\n\nTranscript head:\n", 1)
    assert scene_text == "\n".join(expected_summaries)
    assert transcript_head == transcript[:6000]
    assert parse_timestamp.call_count == 80


@pytest.mark.parametrize(
    "content",
    [
        None,
        "not JSON",
        "[]",
        "null",
        "{}",
        '{"concepts":null}',
        '{"concepts":{}}',
        '{"concepts":[{}]}',
        '{"concepts":[null]}',
        '{"concepts":[{"label":42}]}',
        '{"concepts":[{"label":"  "}]}',
        '{"concepts":[{"label":"Evaporation"},{}]}',
    ],
)
def test_invalid_extraction_is_not_treated_as_no_concepts(extraction, content) -> None:
    _, respond = extraction
    respond(content)
    with pytest.raises(ValueError):
        plog_build._extract_concepts("transcript")


def test_valid_inventory_preserves_concept_details(extraction) -> None:
    _, respond = extraction
    respond(json.dumps({"concepts": [{"label": " Evaporation ", "intro_sec": 3}]}))
    assert plog_build._extract_concepts("transcript") == [
        {"label": "Evaporation", "intro_sec": 3}
    ]


@pytest.mark.parametrize("hints", ["hint", {}, 42, [None], ["hint", 42], [{"text": "hint", "level": 1}]])
def test_invalid_hint_format_is_rejected_before_embedding(extraction, monkeypatch, hints) -> None:
    _, respond = extraction
    respond(json.dumps({"concepts": [{"label": "Evaporation", "hints": hints}]}))
    embed = MagicMock()
    monkeypatch.setattr(plog_build, "embed_texts", embed)
    with pytest.raises(ValueError, match="PLOG hints must be an array of strings"):
        plog_build.generate_plog_artifacts(42, "transcript")
    embed.assert_not_called()


@pytest.mark.parametrize("label", ["Evaporation", "x" * 255 + "first suffix"])
def test_duplicate_labels_are_embedded_and_saved_once_after_normalization(
    extraction, monkeypatch, label
) -> None:
    _, respond = extraction
    duplicate = " Evaporation " if len(label) < 255 else "x" * 255 + "second suffix"
    respond(json.dumps({"concepts": [
        {"label": label, "intro_sec": 3, "source_quote": "first occurrence"},
        {"label": duplicate, "intro_sec": 9},
        {"label": "Distinct", "intro_sec": 12},
    ]}))
    conn = MagicMock()

    @contextmanager
    def connection():
        yield conn

    monkeypatch.setattr(plog_build, "db_connection", connection)
    monkeypatch.setattr(plog_build, "assert_embedding_schema", MagicMock())
    embed = MagicMock(return_value=[[1.0], [2.0]])
    monkeypatch.setattr(plog_build, "embed_texts", embed)
    artifacts = plog_build.generate_plog_artifacts(42, "transcript")
    expected_label = label[:255]
    embed.assert_called_once_with([expected_label, "Distinct"])
    assert artifacts.concepts == [
        {"label": expected_label, "intro_sec": 3, "source_quote": "first occurrence"},
        {"label": "Distinct", "intro_sec": 12},
    ]
    conn.execute.return_value.fetchone.side_effect = [{"id": 1}, {"id": 2}]
    plog_build.save_plog_artifacts(conn, 42, artifacts)
    concepts = [call.args[1] for call in conn.execute.call_args_list
                if "INSERT INTO plog_concepts" in call.args[0]]
    assert [(params[0], json.loads(params[4])) for params in concepts] == [
        (expected_label, [1.0]), ("Distinct", [2.0]),
    ]


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL is required for PostgreSQL integration tests",
)
@pytest.mark.parametrize("reject_summary_delete", [False, True])
def test_empty_rebuild_clears_only_target_video_artifacts_without_embeddings(
    extraction,
    monkeypatch,
    reject_summary_delete,
) -> None:
    embed = MagicMock()
    monkeypatch.setattr(plog_build, "embed_texts", embed)
    artifacts = plog_build.generate_plog_artifacts(42, "This is a recording test.")
    assert artifacts == plog_build.PlogArtifacts([], [])

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        # All test data stays in session-local tables, including the FK children.
        conn.execute(
            "CREATE TEMP TABLE plog_concepts (id int PRIMARY KEY, video_id int)"
        )
        for table in ("learner_concept_states", "plog_learning_objects"):
            conn.execute(
                sql.SQL(
                    "CREATE TEMP TABLE {} (concept_id int REFERENCES plog_concepts(id) ON DELETE CASCADE)"
                ).format(sql.Identifier(table))
            )
        conn.execute("""
            CREATE TEMP TABLE plog_edges (
                video_id int, source_id int REFERENCES plog_concepts(id) ON DELETE CASCADE,
                target_id int REFERENCES plog_concepts(id) ON DELETE CASCADE
            )
        """)
        conn.execute("CREATE TEMP TABLE plog_summary_nodes (video_id int)")
        for video_id in (42, 43):
            conn.execute(
                "INSERT INTO plog_concepts VALUES (%s, %s)", (video_id, video_id)
            )
            for table in ("learner_concept_states", "plog_learning_objects"):
                conn.execute(
                    sql.SQL("INSERT INTO {} VALUES (%s)").format(sql.Identifier(table)),
                    (video_id,),
                )
            conn.execute("INSERT INTO plog_edges VALUES (%s, %s, %s)", (video_id,) * 3)
            conn.execute("INSERT INTO plog_summary_nodes VALUES (%s)", (video_id,))

        # The schema allows an edge whose video differs from both endpoints.
        # Rebuild must still remove every edge scoped to the target video.
        conn.execute("INSERT INTO plog_edges VALUES (42, 43, 43)")
        if reject_summary_delete:
            conn.execute("""
                CREATE FUNCTION pg_temp.reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'delete rejected'; END $$;
                CREATE TRIGGER reject_delete BEFORE DELETE ON plog_summary_nodes
                  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_delete();
            """)
        conn.commit()
        tracked = MagicMock(wraps=conn)
        if reject_summary_delete:
            with pytest.raises(psycopg.errors.RaiseException, match="delete rejected"):
                plog_build.save_plog_artifacts(tracked, 42, artifacts)
            conn.rollback()
        else:
            plog_build.save_plog_artifacts(tracked, 42, artifacts)
            conn.commit()
        assert tracked.execute.call_count == 3

        expected = [(42,), (43,)] if reject_summary_delete else [(43,)]
        assert (
            conn.execute("SELECT id FROM plog_concepts ORDER BY id").fetchall()
            == expected
        )
        for table in ("learner_concept_states", "plog_learning_objects"):
            assert (
                conn.execute(
                    sql.SQL("SELECT concept_id FROM {} ORDER BY concept_id").format(
                        sql.Identifier(table)
                    )
                ).fetchall()
                == expected
            )
        for table in ("plog_edges", "plog_summary_nodes"):
            table_expected = (
                [(42,), (42,), (43,)]
                if table == "plog_edges" and reject_summary_delete
                else expected
            )
            assert (
                conn.execute(
                    sql.SQL("SELECT video_id FROM {} ORDER BY video_id").format(
                        sql.Identifier(table)
                    )
                ).fetchall()
                == table_expected
            )

    embed.assert_not_called()


def test_invalid_extraction_does_not_clear_existing_graph(extraction) -> None:
    _, respond = extraction
    respond('{"concepts":null}')
    conn = MagicMock()

    with pytest.raises(ValueError):
        artifacts = plog_build.generate_plog_artifacts(42, "transcript")
        plog_build.save_plog_artifacts(conn, 42, artifacts)

    conn.execute.assert_not_called()


@pytest.mark.parametrize("api_failure", [False, True])
def test_sqs_completes_empty_analysis_but_retries_api_failure(
    extraction,
    monkeypatch,
    api_failure,
) -> None:
    client, _ = extraction
    if api_failure:
        client.chat.completions.create.side_effect = RuntimeError("API unavailable")
    conn = MagicMock()

    @contextmanager
    def connection():
        yield conn

    connect = MagicMock(side_effect=connection)
    monkeypatch.setattr(build_plog, "db_connection", connect)
    conn.execute.return_value.fetchone.return_value = {"transcript": "This is a recording test."}
    monkeypatch.setattr(build_plog, "_claim_build_job", MagicMock(return_value=7))
    update = MagicMock()
    monkeypatch.setattr(build_plog, "_finish_build_job", update)
    monkeypatch.setattr(lambda_handler, "ensure_secrets_loaded", MagicMock())
    monkeypatch.setattr(
        lambda_handler,
        "claim_job_execution",
        MagicMock(return_value="lease-1"),
    )
    monkeypatch.setattr(
        lambda_handler,
        "get_task",
        MagicMock(return_value=build_plog.build_plog_artifacts),
    )
    complete, fail = MagicMock(), MagicMock()
    monkeypatch.setattr(lambda_handler, "complete_job_execution", complete)
    monkeypatch.setattr(lambda_handler, "fail_job_execution", fail)
    event = {
        "Records": [
            {
                "messageId": "message-1",
                "body": json.dumps(
                    {
                        "type": "build_plog",
                        "job_id": "job-1",
                        "payload": {"video_id": 42},
                    }
                ),
            }
        ]
    }

    result = lambda_handler.handler(event, None)

    if api_failure:
        assert result == {"batchItemFailures": [{"itemIdentifier": "message-1"}]}
        assert update.call_args.kwargs["status"] == "failed"
        complete.assert_not_called()
        fail.assert_called_once_with("job-1", "lease-1", "API unavailable")
    else:
        assert result == {"batchItemFailures": []}
        update.assert_called_once_with(conn, 7, status="ready")
        complete.assert_called_once_with("job-1", "lease-1")
        fail.assert_not_called()
    assert conn.commit.call_count == 2
    assert connect.call_count == 2
