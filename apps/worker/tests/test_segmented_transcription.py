from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import openai
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
import pytest

from worker_python import transcription_checkpoints as checkpoints
from worker_python.tasks import segmented_transcription as tasks
from worker_python.tasks import transcription
from worker_python.video_sql import get_video_for_task


@pytest.fixture
def checkpoint_db(monkeypatch):
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL is required for PostgreSQL integration tests")
    monkeypatch.delenv("WHISPER_BACKEND", raising=False)
    schema = f"checkpoints_{uuid4().hex}"
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            def connect():
                return psycopg.connect(url, options=f"-csearch_path={schema}", row_factory=dict_row)

            with connect() as conn:
                conn.execute("""
                    CREATE TABLE users (
                        id text PRIMARY KEY, processing_limit_minutes int,
                        used_processing_seconds int DEFAULT 0, used_ai_answers int DEFAULT 0,
                        usage_period_start timestamptz DEFAULT now(), is_over_quota bool DEFAULT false
                    );
                    CREATE TABLE videos (
                        id bigint PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE,
                        title text DEFAULT 'Video', transcript text, status text DEFAULT 'pending',
                        source_type text DEFAULT 'uploaded', file text DEFAULT 'video.mkv',
                        youtube_video_id text DEFAULT '', error_message text DEFAULT '',
                        processing_seconds int DEFAULT 0
                    );
                    INSERT INTO users (id) VALUES ('owner');
                    INSERT INTO videos (id, user_id) VALUES (42, 'owner');
                """)
                migration = Path(__file__).parents[2] / "api/drizzle/0031_resumable_transcription.sql"
                # Execute the generated production DDL in this isolated test schema.
                conn.execute(migration.read_text().replace('"public".', ''))
                fallback_migration = Path(__file__).parents[2] / "api/drizzle/0037_resumable_transcription_fallback.sql"
                conn.execute(fallback_migration.read_text())
            for module in (checkpoints, tasks, transcription):
                monkeypatch.setattr(module, "db_connection", connect)
            monkeypatch.setenv("SQS_QUEUE_URL", "https://example.invalid/jobs")
            monkeypatch.setenv("VIDEO_VISUAL_ENABLED", "false")
            yield connect
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def video(connect):
    with connect() as conn:
        return get_video_for_task(conn, 42, include_transcript=False)


def test_concurrent_initialization_resumes_one_plan_and_reserves_quota_once(checkpoint_db):
    source = video(checkpoint_db)
    with ThreadPoolExecutor(max_workers=4) as pool:
        runs = list(pool.map(lambda _: checkpoints.initialize_run(source, 9289.617), range(4)))
    assert len({r.run_id for r in runs}) == 1
    assert runs[0].chunk_count == 31
    assert runs[0].duration_ms == 9289617
    assert checkpoints.pending_heads(runs[0]) == [0, 1, 2, 3]
    with checkpoint_db() as conn:
        assert conn.execute("SELECT used_processing_seconds FROM users").fetchone()["used_processing_seconds"] == 9290
        assert conn.execute("SELECT count(*) AS n FROM video_transcription_chunks").fetchone()["n"] == 31


def test_modal_plan_uses_thirty_minute_checkpoints_and_keeps_them_on_resume(checkpoint_db, monkeypatch):
    monkeypatch.setenv("WHISPER_BACKEND", "modal")
    run = checkpoints.initialize_run(video(checkpoint_db), 9289.617)
    assert run.chunk_seconds == 1800
    assert run.chunk_count == 6
    assert checkpoints.pending_heads(run) == [0, 1, 2, 3]
    monkeypatch.setenv("WHISPER_BACKEND", "openai")
    resumed = checkpoints.initialize_run(video(checkpoint_db), 9289.617)
    assert resumed.run_id == run.run_id
    assert resumed.chunk_seconds == 1800
    assert resumed.chunk_count == 6


def test_long_modal_interval_calls_provider_once(monkeypatch):
    monkeypatch.setenv("WHISPER_BACKEND", "modal")
    provider = MagicMock(return_value=[{"start": 1, "end": 2, "text": "caption"}])
    monkeypatch.setattr(tasks, "transcribe_audio_interval", provider)
    assert tasks._transcribe_interval("video.mkv", 600, 1800) == provider.return_value
    provider.assert_called_once_with("video.mkv", 600, 1800)


def test_long_interval_uses_five_minute_parts_after_backend_change(monkeypatch):
    monkeypatch.setenv("WHISPER_BACKEND", "openai")
    provider = MagicMock(side_effect=lambda _, start, duration: [
        {"start": start, "end": start + duration, "text": "caption"},
    ])
    monkeypatch.setattr(tasks, "transcribe_audio_interval", provider)
    segments = tasks._transcribe_interval("video.mkv", 600, 601)
    assert [call.args[1:] for call in provider.call_args_list] == [
        (600, 300), (900, 300), (1200, 1),
    ]
    assert [segment["start"] for segment in segments] == [600, 900, 1200]


@pytest.mark.parametrize("status", [400, 500])
def test_modal_rejection_falls_back_to_five_minute_parts(monkeypatch, status):
    monkeypatch.setenv("WHISPER_BACKEND", "modal")
    request = httpx.Request("POST", "https://example.modal.run/v1/audio/transcriptions")
    rejected = openai.APIStatusError(
        "long request failed", response=httpx.Response(status, request=request), body=None,
    )
    provider = MagicMock(side_effect=[rejected, [], []])
    monkeypatch.setattr(tasks, "transcribe_audio_interval", provider)
    assert tasks._transcribe_interval("video.mkv", 0, 600) == []
    assert [call.args[1:] for call in provider.call_args_list] == [
        (0, 600), (0, 300), (300, 300),
    ]


def test_fallback_reuses_paid_parts_after_job_retry(checkpoint_db, monkeypatch):
    monkeypatch.setenv("WHISPER_BACKEND", "modal")
    run = checkpoints.initialize_run(video(checkpoint_db), 1200)
    request = httpx.Request("POST", "https://example.modal.run/v1/audio/transcriptions")
    rejected = openai.APIStatusError(
        "long request failed", response=httpx.Response(500, request=request), body=None,
    )
    first = [{"start": 0, "end": 1, "text": "first"}]
    remaining = [
        [{"start": start, "end": start + 1, "text": f"part {start}"}]
        for start in (300, 600, 900)
    ]
    provider = MagicMock(side_effect=[rejected, first, RuntimeError("temporary failure"), *remaining])
    monkeypatch.setattr(tasks, "transcribe_audio_interval", provider)
    monkeypatch.setattr(tasks, "resolve_media_input", lambda key: key)
    monkeypatch.setattr(tasks, "enqueue_job", lambda *args, **kwargs: "message")

    with pytest.raises(RuntimeError, match="temporary failure"):
        tasks.transcribe_video_chunk(42, run.run_id, 0)
    with checkpoint_db() as conn:
        row = conn.execute("SELECT segments, fallback_segments FROM video_transcription_chunks").fetchone()
        assert row["segments"] is None
        assert row["fallback_segments"] == {"_split": [], "0": first}

    tasks.transcribe_video_chunk(42, run.run_id, 0)
    assert [call.args[1:] for call in provider.call_args_list] == [
        (0, 1200), (0, 300), (300, 300), (300, 300), (600, 300), (900, 300),
    ]
    with checkpoint_db() as conn:
        row = conn.execute("SELECT segments, fallback_segments FROM video_transcription_chunks").fetchone()
        assert [segment["text"] for segment in row["segments"]] == [
            "first", "part 300", "part 600", "part 900",
        ]
        assert row["fallback_segments"] == {}


def test_fallback_does_not_repeat_long_request_when_first_part_fails(checkpoint_db, monkeypatch):
    monkeypatch.setenv("WHISPER_BACKEND", "modal")
    run = checkpoints.initialize_run(video(checkpoint_db), 1200)
    request = httpx.Request("POST", "https://example.modal.run/v1/audio/transcriptions")
    rejected = openai.APIStatusError(
        "long request failed", response=httpx.Response(500, request=request), body=None,
    )
    provider = MagicMock(side_effect=[rejected, RuntimeError("temporary failure"), [], [], [], []])
    monkeypatch.setattr(tasks, "transcribe_audio_interval", provider)
    monkeypatch.setattr(tasks, "resolve_media_input", lambda key: key)
    monkeypatch.setattr(tasks, "enqueue_job", lambda *args, **kwargs: "message")

    with pytest.raises(RuntimeError, match="temporary failure"):
        tasks.transcribe_video_chunk(42, run.run_id, 0)
    with checkpoint_db() as conn:
        row = conn.execute("SELECT fallback_segments FROM video_transcription_chunks").fetchone()
        assert row["fallback_segments"] == {"_split": []}

    tasks.transcribe_video_chunk(42, run.run_id, 0)
    assert [call.args[1:] for call in provider.call_args_list] == [
        (0, 1200), (0, 300), (0, 300), (300, 300), (600, 300), (900, 300),
    ]


def test_production_entry_initializes_lanes_without_transcribing_inline(checkpoint_db, monkeypatch):
    monkeypatch.setattr(transcription, "heavy_pipeline_enabled", lambda: True)
    monkeypatch.setattr(tasks, "_ffprobe_duration", lambda _: 9289.617)
    monkeypatch.setattr(tasks, "resolve_media_input", lambda key: key)
    inline = MagicMock()
    monkeypatch.setattr(transcription, "run_transcription", inline)
    enqueue = MagicMock(return_value="message")
    monkeypatch.setattr(tasks, "enqueue_job", enqueue)
    transcription.transcribe_video(42, job_id="parent")
    transcription.transcribe_video(42, job_id="parent-retry")
    inline.assert_not_called()
    assert [call.args[1]["chunk_index"] for call in enqueue.call_args_list] == [0, 1, 2, 3] * 2
    assert [call.kwargs["job_id"] for call in enqueue.call_args_list[:4]] == [
        call.kwargs["job_id"] for call in enqueue.call_args_list[4:]
    ]


def test_completed_checkpoint_survives_failed_queue_handoff(checkpoint_db, monkeypatch):
    run = checkpoints.initialize_run(video(checkpoint_db), 1500)
    provider = MagicMock(return_value=[{"start": 0, "end": 1, "text": "first"}])
    monkeypatch.setattr(tasks, "transcribe_audio_interval", provider)
    monkeypatch.setattr(tasks, "resolve_media_input", lambda key: key)
    enqueue = MagicMock(side_effect=RuntimeError("queue unavailable"))
    monkeypatch.setattr(tasks, "enqueue_job", enqueue)
    with pytest.raises(RuntimeError, match="queue unavailable"):
        tasks.transcribe_video_chunk(42, run.run_id, 0)
    enqueue.side_effect = None
    enqueue.return_value = "message"
    tasks.transcribe_video_chunk(42, run.run_id, 0)
    provider.assert_called_once_with("video.mkv", 0, 300)
    assert enqueue.call_args.args[1]["chunk_index"] == 4
    with checkpoint_db() as conn:
        assert conn.execute("SELECT failures FROM video_transcription_chunks WHERE chunk_index = 0").fetchone()["failures"] == 0


def test_out_of_order_chunks_join_once_and_final_handoff_can_retry(checkpoint_db, monkeypatch):
    run = checkpoints.initialize_run(video(checkpoint_db), 9289.617)
    enqueue = MagicMock(return_value="message")
    monkeypatch.setattr(tasks, "enqueue_job", enqueue)
    monkeypatch.setattr(tasks, "resolve_media_input", lambda key: key)
    provider = MagicMock(side_effect=lambda source, start, duration: [
        {"start": start, "end": start + duration, "text": f"chunk {int(start / 300)}"},
    ])
    monkeypatch.setattr(tasks, "transcribe_audio_interval", provider)
    with pytest.raises(RuntimeError, match="incomplete"):
        tasks.finish_video_transcription(42, run.run_id)
    for index in reversed(range(run.chunk_count)):
        tasks.transcribe_video_chunk(42, run.run_id, index)
    assert provider.call_count == 31
    assert provider.call_args_list[0].args[1:] == (9000, pytest.approx(289.617))
    enqueue.side_effect = RuntimeError("final delivery lost")
    with pytest.raises(RuntimeError, match="final delivery lost"):
        tasks.finish_video_transcription(42, run.run_id)
    with checkpoint_db() as conn:
        saved = conn.execute("SELECT status, transcript FROM videos").fetchone()
    assert saved["status"] == "indexing"
    assert "02:34:49,617" in saved["transcript"]
    assert saved["transcript"].index("chunk 0") < saved["transcript"].index("chunk 30")
    assert checkpoints.load_run(42).completed
    enqueue.side_effect = None
    enqueue.return_value = "message"
    tasks.finish_video_transcription(42, run.run_id)
    tasks.transcribe_video_chunk(42, run.run_id, 30)
    assert provider.call_count == 31
    assert enqueue.call_args.args == ("index_video_transcript", {"video_id": 42})
    with checkpoint_db() as conn:
        assert conn.execute("SELECT transcript FROM videos").fetchone()["transcript"] == saved["transcript"]


@pytest.mark.parametrize("change", ["edit", "delete", "delete_account", "replace_source", "replace_run"])
def test_inflight_results_cannot_overwrite_changed_video(checkpoint_db, monkeypatch, change):
    run = checkpoints.initialize_run(video(checkpoint_db), 10)
    def generate(*_):
        with checkpoint_db() as conn:
            if change == "edit":
                conn.execute("UPDATE videos SET transcript = 'User edit', status = 'completed'")
            elif change == "delete":
                conn.execute("DELETE FROM videos")
            elif change == "delete_account":
                conn.execute("DELETE FROM users")
            elif change == "replace_source":
                conn.execute("UPDATE videos SET file = 'replacement.mkv'")
            else:
                conn.execute("DELETE FROM video_transcription_runs")
        if change == "replace_run":
            checkpoints.initialize_run(video(checkpoint_db), 20)
        return [{"start": 0, "end": 1, "text": "Discard this"}]
    monkeypatch.setattr(tasks, "resolve_media_input", lambda key: key)
    monkeypatch.setattr(tasks, "transcribe_audio_interval", generate)
    enqueue = MagicMock(return_value="message")
    monkeypatch.setattr(tasks, "enqueue_job", enqueue)
    tasks.transcribe_video_chunk(42, run.run_id, 0)
    tasks.finish_video_transcription(42, run.run_id)
    enqueue.assert_not_called()
    with checkpoint_db() as conn:
        assert conn.execute("SELECT count(*) AS n FROM video_transcription_chunks WHERE segments IS NOT NULL").fetchone()["n"] == 0
        if change in {"delete", "delete_account"}:
            assert conn.execute("SELECT count(*) AS n FROM video_transcription_runs").fetchone()["n"] == 0
        elif change == "edit":
            assert conn.execute("SELECT transcript FROM videos").fetchone()["transcript"] == "User edit"


def test_failed_chunk_resumes_and_silent_chunk_is_a_completed_checkpoint(checkpoint_db, monkeypatch):
    run = checkpoints.initialize_run(video(checkpoint_db), 301)
    monkeypatch.setattr(tasks, "resolve_media_input", lambda key: key)
    provider = MagicMock(side_effect=RuntimeError("ASR unavailable"))
    monkeypatch.setattr(tasks, "transcribe_audio_interval", provider)
    monkeypatch.setattr(tasks, "enqueue_job", lambda *a, **kw: "message")
    for _ in range(5):
        with pytest.raises(RuntimeError, match="ASR unavailable"):
            tasks.transcribe_video_chunk(42, run.run_id, 0)
    assert video(checkpoint_db).status == "error"
    assert checkpoints.initialize_run(video(checkpoint_db), 301).run_id == run.run_id
    provider.side_effect = None
    provider.return_value = []
    tasks.transcribe_video_chunk(42, run.run_id, 0)
    tasks.transcribe_video_chunk(42, run.run_id, 0)
    assert provider.call_count == 6
    provider.return_value = [{"start": 300, "end": 301, "text": "last second"}]
    tasks.transcribe_video_chunk(42, run.run_id, 1)
    tasks.finish_video_transcription(42, run.run_id)
    assert video(checkpoint_db).status == "indexing"


def test_quota_failure_never_enqueues_or_creates_a_plan(checkpoint_db, monkeypatch):
    with checkpoint_db() as conn:
        conn.execute("UPDATE users SET processing_limit_minutes = 1")
    monkeypatch.setattr(transcription, "heavy_pipeline_enabled", lambda: True)
    monkeypatch.setattr(tasks, "_ffprobe_duration", lambda _: 9289.617)
    monkeypatch.setattr(tasks, "resolve_media_input", lambda key: key)
    enqueue = MagicMock()
    monkeypatch.setattr(tasks, "enqueue_job", enqueue)
    transcription.transcribe_video(42)
    assert video(checkpoint_db).status == "error"
    assert checkpoints.load_run(42) is None
    enqueue.assert_not_called()


def test_all_silent_plan_ends_in_error_and_user_retry_can_start_again(checkpoint_db, monkeypatch):
    run = checkpoints.initialize_run(video(checkpoint_db), 10)
    checkpoints.save_chunk(run, 0, [])
    enqueue = MagicMock()
    monkeypatch.setattr(tasks, "enqueue_job", enqueue)
    tasks.finish_video_transcription(42, run.run_id)
    tasks.finish_video_transcription(42, run.run_id)
    assert video(checkpoint_db).status == "error"
    assert checkpoints.load_run(42).completed
    enqueue.assert_not_called()
    assert checkpoints.initialize_run(video(checkpoint_db), 10).run_id != run.run_id
