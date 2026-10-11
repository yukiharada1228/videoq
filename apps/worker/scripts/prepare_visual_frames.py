"""Backfill one uploaded video's visual cache without transcription/embedding calls."""
import argparse
import os
import sys
from pathlib import Path

# Match the other operator scripts; an editable install is not required.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker_python.db import db_connection
from worker_python.pipeline.storage import resolve_media_input
from worker_python.pipeline.transcription import _ffprobe_duration
from worker_python import visual_checkpoints
from worker_python.tasks.segmented_visuals import start_visuals, build_video_visual_chunk, finish_video_visuals
from worker_python.video_sql import get_video_for_task


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", type=int, required=True)
    args = parser.parse_args()
    with db_connection() as conn:
        video = get_video_for_task(conn, args.video_id, include_transcript=False)
    if not video or video.source_type != "uploaded" or not video.file_key:
        parser.error("An existing uploaded video is required")
    path = resolve_media_input(video.file_key)
    duration = _ffprobe_duration(path)
    if os.environ.get('SQS_QUEUE_URL', '').strip():
        start_visuals(video.id, video.file_key, duration)
        print(f"video={video.id} visual_preparation=queued")
    else:
        run = visual_checkpoints.initialize(video.id, video.file_key, duration)
        if not run:
            parser.error('Video source changed before preparation')
        for index in range(run.chunk_count):
            build_video_visual_chunk(video.id, run.run_id, index, dispatch_next=False)
        finish_video_visuals(video.id, run.run_id)
        print(f"video={video.id} visual_preparation=ready chunks={run.chunk_count}")


if __name__ == "__main__":
    main()
