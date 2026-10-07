import json
import shutil
import subprocess
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from worker_python.pipeline import visual_frames, storage
from worker_python.pipeline import transcription
from worker_python.pipeline import focus_frames


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg is required")
def test_real_video_cache_uses_selected_frame_pts_and_jpeg_images(tmp_path):
    video = tmp_path / "lecture.mp4"
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
        "testsrc2=size=320x180:rate=30:duration=12", "-c:v", "mpeg4", str(video),
    ], check=True)
    payload = visual_frames.build_frame_cache(video, 42, 12)
    cache = json.loads(payload)
    assert cache["video_id"] == 42
    assert cache["sampling_interval_seconds"] == 5
    assert [frame["timestamp_seconds"] for frame in cache["frames"]] == [0, 5, 10]
    assert all(frame["jpeg_base64"].startswith("/9j/") for frame in cache["frames"])
    assert len(payload) < visual_frames.MAX_CACHE_BYTES


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg is required")
def test_video_start_offset_relative_to_audio_is_preserved(tmp_path):
    video = tmp_path / "delayed-video.mp4"
    subprocess.run([
        "ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
        "testsrc2=size=160x90:rate=10:duration=8", "-f", "lavfi", "-i",
        "sine=duration=10", "-vf", "setpts=PTS+2/TB", "-fps_mode", "vfr",
        "-c:v", "mpeg4", "-c:a", "aac", str(video),
    ], check=True)
    cache = json.loads(visual_frames.build_frame_cache(video, 42, 10))
    assert [frame["timestamp_seconds"] for frame in cache["frames"]] == [2, 7]


@pytest.mark.parametrize("case", ["empty", "oversized_image", "oversized_cache", "invalid_time", "failed"])
def test_rejects_incomplete_or_over_budget_cache(monkeypatch, tmp_path, case):
    def extract(command):
        output = Path(command[-1]).parent
        if case != "empty":
            name = "999999" if case == "invalid_time" else "0"
            size = visual_frames.MAX_IMAGE_BYTES + 1 if case == "oversized_image" else 32
            (output / f"{name}.jpg").write_bytes(b"\xff\xd8\xff" + b"x" * size)
        return SimpleNamespace(returncode=1 if case == "failed" else 0, stderr="failure")
    if case == "oversized_cache":
        monkeypatch.setattr(visual_frames, "MAX_CACHE_BYTES", 20)
    monkeypatch.setattr(visual_frames, "run_media_process", extract)
    with pytest.raises((ValueError, RuntimeError)):
        visual_frames.build_frame_cache(tmp_path / "video.mp4", 42, 10)


@pytest.mark.parametrize("row,publishes", [
    (None, False),
    ({"file": "changed.mp4", "source_type": "uploaded"}, False),
    ({"file": "video.mp4", "source_type": "youtube"}, False),
    ({"file": "video.mp4", "source_type": "uploaded"}, True),
])
def test_publication_rechecks_video_under_lock(monkeypatch, row, publishes):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = row
    in_transaction = False

    @contextmanager
    def transaction():
        nonlocal in_transaction
        in_transaction = True
        try:
            yield conn
        finally:
            in_transaction = False

    calls = []
    def upload(*args):
        assert in_transaction
        calls.append(args)

    monkeypatch.setattr(visual_frames, "db_connection", transaction)
    monkeypatch.setattr(visual_frames, "upload_bytes", upload)
    assert visual_frames.publish_frame_cache(42, "video.mp4", b"cache") is publishes
    assert "FOR UPDATE" in conn.execute.call_args.args[0]
    assert calls == ([("video.mp4.frames-v1.json", b"cache", "application/json")] if publishes else [])


def test_local_cache_publication_is_replaceable_and_removable(tmp_path, monkeypatch):
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    monkeypatch.setenv("USE_S3_STORAGE", "false")
    key = visual_frames.frame_cache_key("videos/42.mp4")
    storage.upload_bytes(key, b"first", "application/json")
    storage.upload_bytes(key, b"second", "application/json")
    assert (tmp_path / key).read_bytes() == b"second"
    assert len(list((tmp_path / "videos").iterdir())) == 1
    storage.delete_object(key)
    assert not (tmp_path / key).exists()


@pytest.mark.parametrize("enabled,fails", [(False, False), (True, False), (True, True), (None, False)])
def test_upload_transcription_prepares_optional_frames_without_losing_subtitles(monkeypatch, enabled, fails):
    if enabled is None:
        monkeypatch.delenv("VIDEO_VISUAL_ENABLED", raising=False)
    else:
        monkeypatch.setenv("VIDEO_VISUAL_ENABLED", str(enabled).lower())
    monkeypatch.setattr(transcription, "download_to_path", lambda *_: None)
    monkeypatch.setattr(transcription, "_ffmpeg_extract_mp3", lambda *_: None)
    monkeypatch.setattr(transcription, "_ffprobe_duration", lambda _: 10)
    monkeypatch.setattr(transcription, "_whisper_transcribe", lambda _: [{"start": 0, "end": 1, "text": "A useful subtitle"}])
    build = MagicMock(return_value=b"cache")
    if fails:
        build.side_effect = RuntimeError("cache failed")
    publish = MagicMock(return_value=True)
    monkeypatch.setattr(visual_frames, "build_frame_cache", build)
    monkeypatch.setattr(visual_frames, "publish_frame_cache", publish)
    @contextmanager
    def dense(*_):
        yield Path("focus.bin")
    dense_build = MagicMock(side_effect=dense)
    dense_publish = MagicMock(return_value=True)
    monkeypatch.setattr(focus_frames, "build_focus_cache", dense_build)
    monkeypatch.setattr(focus_frames, "publish_focus_cache", dense_publish)
    result = transcription._transcribe_uploaded("video.mp4", video_id=42)
    assert "A useful subtitle" in result
    expected = int(enabled is not False)
    assert build.call_count == expected
    assert dense_build.call_count == expected
    assert dense_publish.call_count == expected
    if expected and not fails:
        publish.assert_called_once_with(42, "video.mp4", b"cache")
    else:
        publish.assert_not_called()


def test_dense_cache_failure_does_not_lose_transcript_or_coarse_cache(monkeypatch):
    monkeypatch.delenv("VIDEO_VISUAL_ENABLED", raising=False)
    monkeypatch.setattr(transcription, "download_to_path", lambda *_: None)
    monkeypatch.setattr(transcription, "_ffmpeg_extract_mp3", lambda *_: None)
    monkeypatch.setattr(transcription, "_ffprobe_duration", lambda _: 10)
    monkeypatch.setattr(transcription, "_whisper_transcribe", lambda _: [{"start": 0, "end": 1, "text": "Useful"}])
    monkeypatch.setattr(visual_frames, "build_frame_cache", lambda *_: b"coarse")
    publish = MagicMock()
    monkeypatch.setattr(visual_frames, "publish_frame_cache", publish)
    monkeypatch.setattr(focus_frames, "build_focus_cache", MagicMock(side_effect=RuntimeError("dense failure")))
    assert "Useful" in transcription._transcribe_uploaded("video.mp4", video_id=42)
    publish.assert_called_once()
