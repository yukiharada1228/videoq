#!/usr/bin/env python3
"""
Drain local pending/indexing videos without SQS.

Usage (from apps/worker/):
  export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres
  export EMBEDDING_PROVIDER=ollama EMBEDDING_MODEL=qwen3-embedding:0.6b EMBEDDING_VECTOR_SIZE=1024
  # optional real transcription:
  # export ENABLE_HEAVY_PIPELINE=1 OPENAI_API_KEY=... JWT_SECRET=...
  python scripts/process_pending.py
  python scripts/process_pending.py --video-id 83
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

# Allow `python scripts/process_pending.py` without install.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from worker_python.db import db_connection
from worker_python.tasks.indexing import index_video_transcript
from worker_python.tasks.transcription import transcribe_video

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("process_pending")


def list_targets(video_id: int | None) -> list[tuple[int, str]]:
    with db_connection() as conn:
        if video_id is not None:
            row = conn.execute(
                "SELECT id, status FROM app_video WHERE id = %s",
                (video_id,),
            ).fetchone()
            return [(int(row["id"]), row["status"])] if row else []
        rows = conn.execute(
            """
            SELECT id, status
              FROM app_video
             WHERE status IN ('pending', 'error', 'indexing')
             ORDER BY id
            """
        ).fetchall()
        return [(int(r["id"]), r["status"]) for r in rows]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", type=int, default=None)
    args = parser.parse_args()

    if not os.environ.get("DATABASE_URL"):
        logger.error("DATABASE_URL is required")
        return 2

    targets = list_targets(args.video_id)
    if not targets:
        logger.info("No pending/error/indexing videos found")
        return 0

    for vid, status in targets:
        logger.info("Processing video %d (status=%s)", vid, status)
        try:
            if status in {"pending", "error"}:
                transcribe_video(vid)
            elif status == "indexing":
                index_video_transcript(vid)
        except Exception:
            logger.exception("Failed video %d", vid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
