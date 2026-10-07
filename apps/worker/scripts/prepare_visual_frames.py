"""Backfill one uploaded video's visual cache without transcription/embedding calls."""
import argparse
import sys
import tempfile
from pathlib import Path

# Match the other operator scripts; an editable install is not required.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker_python.db import db_connection
from worker_python.pipeline.storage import download_to_path
from worker_python.pipeline.transcription import _ffprobe_duration
from worker_python.pipeline.visual_frames import build_frame_cache, publish_frame_cache
from worker_python.pipeline.focus_frames import build_focus_cache, publish_focus_cache
from worker_python.video_sql import get_video_for_task


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video-id", type=int, required=True)
    args = parser.parse_args()
    with db_connection() as conn:
        video = get_video_for_task(conn, args.video_id, include_transcript=False)
    if not video or video.source_type != "uploaded" or not video.file_key:
        parser.error("An existing uploaded video is required")
    with tempfile.TemporaryDirectory(prefix="videoq-visual-backfill-") as tmp:
        path = download_to_path(video.file_key, Path(tmp) / "video")
        duration = _ffprobe_duration(path)
        payload = build_frame_cache(path, video.id, duration)
        published = publish_frame_cache(video.id, video.file_key, payload)
        with build_focus_cache(path, video.id, duration) as pack:
            focus_published = publish_focus_cache(video.id, video.file_key, pack)
            focus_bytes = pack.stat().st_size
    print(f"video={video.id} published={published} cache_bytes={len(payload)} focus_published={focus_published} focus_bytes={focus_bytes}")


if __name__ == "__main__":
    main()
