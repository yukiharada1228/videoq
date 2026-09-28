"""Build a synthetic short video's search index with real providers."""

from worker_python.db import db_connection
from worker_python.pipeline.vector_index import index_video_transcript
from worker_python.video_sql import get_video_for_task

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
    row = get_video_for_task(conn, 60)

assert row is not None
assert index_video_transcript(row) > 0
print("live_index_ok")
