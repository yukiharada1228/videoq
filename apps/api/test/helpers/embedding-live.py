"""Build a synthetic short video's search index and PLOG with real providers."""

from worker_python.db import db_connection
from worker_python.pipeline.plog_build import run_plog_pipeline
from worker_python.pipeline.vector_index import index_video_transcript
from worker_python.video_sql import VideoRow

TRANSCRIPT = """1
00:00:00,000 --> 00:00:06,000
蒸発とは、水などの液体が表面から気体に変化することです。

2
00:00:06,000 --> 00:00:12,000
凝結とは、水蒸気などの気体が冷えて液体に変わることです。
"""

with db_connection() as conn:
    conn.execute("""
        INSERT INTO users (id, email, username, max_video_upload_size_mb,
            is_over_quota, used_ai_answers, used_processing_seconds, used_storage_bytes)
        VALUES ('embedding-live', 'embedding-live@example.invalid', 'embedding-live', 100, false, 0, 0, 0)
    """)
    conn.execute("""
        INSERT INTO videos (id, file, title, description, uploaded_at, transcript,
            status, error_message, user_id, source_type, source_url, youtube_video_id)
        VALUES (60, '', '水の状態変化', '', NOW(), %s, 'completed', '',
            'embedding-live', 'uploaded', '', '')
    """, (TRANSCRIPT,))
    conn.commit()

row = VideoRow(id=60, user_id="embedding-live", title="水の状態変化", transcript=TRANSCRIPT,
               status="completed", source_type="uploaded", file_key=None,
               youtube_video_id=None, error_message="")
assert index_video_transcript(row) > 0
with db_connection() as conn:
    run_plog_pipeline(conn, 60, TRANSCRIPT)
    assert conn.execute("SELECT count(*) AS n FROM plog_concepts").fetchone()["n"] > 0
    conn.execute("""
        INSERT INTO plog_build_jobs
            (status, error_message, input_tokens, output_tokens, created_at, updated_at, video_id)
        VALUES ('ready', '', 0, 0, NOW(), NOW(), 60)
    """)
print("live_index_and_plog_ok")
