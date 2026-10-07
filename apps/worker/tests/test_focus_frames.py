import json
import shutil
import struct
import subprocess
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from worker_python.pipeline import focus_frames, storage


def unpack(path):
    data = path.read_bytes()
    assert data[:8] == focus_frames.MAGIC
    length = struct.unpack("<I", data[8:12])[0]
    return json.loads(data[12:12 + length]), data[12 + length:]


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg is required")
@pytest.mark.parametrize("delayed", [False, True])
def test_real_dense_cache_preserves_pts_and_contains_brief_event(tmp_path, delayed):
    video = tmp_path / "lecture.mp4"
    args = ["ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
            "color=c=blue:size=160x90:rate=30:duration=8"]
    filters = "drawbox=color=red:t=fill:enable='gte(t,3)*lt(t,4)'"
    if delayed:
        args += ["-f", "lavfi", "-i", "sine=duration=10"]
        filters += ",setpts=PTS+2/TB"
    subprocess.run([*args, "-vf", filters, "-fps_mode", "vfr", "-c:v", "mpeg4", "-c:a", "aac", str(video)], check=True)
    with focus_frames.build_focus_cache(video, 42, 10 if delayed else 8) as pack:
        index, images = unpack(pack)
        assert index["sampling_interval_seconds"] == 1
        times = [f[0] for f in index["frames"]]
        assert times == list(range(2000, 10000, 1000) if delayed else range(0, 8000, 1000))
        red_time = 5000 if delayed else 3000
        for time, offset, size in index["frames"]:
            image = images[offset:offset + size]
            assert image.startswith(b"\xff\xd8\xff") and image.endswith(b"\xff\xd9")
            if time == red_time:
                rgb = subprocess.check_output(["ffmpeg", "-v", "error", "-i", "pipe:0", "-vf", "scale=1:1",
                    "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], input=image)
                assert rgb[0] > 200 and rgb[2] < 30
        assert index["frames"][-1][1] + index["frames"][-1][2] == len(images)
    assert not pack.exists()


@pytest.mark.parametrize("case", ["failure", "empty", "bad_time", "bad_base", "bad_jpeg", "oversized_image", "extra_bytes", "index_limit", "pack_limit"])
def test_rejects_invalid_or_incomplete_focus_pack(tmp_path, monkeypatch, case):
    def extract(command, **kwargs):
        assert kwargs["max_output_bytes"] <= focus_frames.MAX_PACK_BYTES
        outputs = command[-1].split("|")
        image_path = Path(outputs[0].split("]", 1)[1])
        index_path = Path(outputs[1].split("]", 1)[1])
        image = b"\xff\xd8\xfftest\xff\xd9"
        if case == "bad_jpeg":
            image = b"not jpeg!"
        time = -1 if case == "bad_time" else 0
        size = focus_frames.MAX_IMAGE_BYTES + 1 if case == "oversized_image" else len(image)
        rows = "" if case == "empty" else f"0, 0, {time}, 33, {size}, 0x00000000\n"
        index_path.write_text(("#tb 0: 1/30\n" if case == "bad_base" else "#tb 0: 1/1000\n") + rows)
        image_path.write_bytes(image + (b"extra" if case == "extra_bytes" else b""))
        return SimpleNamespace(returncode=1 if case == "failure" else 0, stderr="failed")
    monkeypatch.setattr(focus_frames, "run_media_process", extract)
    if case == "index_limit":
        monkeypatch.setattr(focus_frames, "MAX_INDEX_BYTES", 1)
    if case == "pack_limit":
        monkeypatch.setattr(focus_frames, "MAX_PACK_BYTES", 100)
    with pytest.raises((ValueError, RuntimeError)):
        with focus_frames.build_focus_cache(tmp_path / "video.mp4", 42, 10):
            pytest.fail("Invalid cache was exposed")


@pytest.mark.parametrize("row,publishes", [
    (None, False), ({"file": "replaced", "source_type": "uploaded"}, False),
    ({"file": "video.mp4", "source_type": "youtube"}, False),
    ({"file": "video.mp4", "source_type": "uploaded"}, True),
])
def test_focus_publication_rechecks_current_video_under_lock(tmp_path, monkeypatch, row, publishes):
    pack = tmp_path / "cache.bin"
    pack.write_bytes(b"x" * 20)
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = row
    active = False
    @contextmanager
    def connection():
        nonlocal active
        active = True
        yield conn
        active = False
    def upload(*args):
        assert active
    put = MagicMock(side_effect=upload)
    monkeypatch.setattr(focus_frames, "db_connection", connection)
    monkeypatch.setattr(focus_frames, "upload_file", put)
    assert focus_frames.publish_focus_cache(42, "video.mp4", pack) is publishes
    assert "FOR UPDATE" in conn.execute.call_args.args[0]
    assert put.call_count == int(publishes)
    if publishes:
        put.assert_called_once_with("video.mp4.focus-v1.bin", pack, "application/octet-stream")


def test_focus_file_publication_streams_and_replaces_atomically(tmp_path, monkeypatch):
    source = tmp_path / "source.bin"
    source.write_bytes(b"x" * 10000)
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path / "media"))
    monkeypatch.setenv("USE_S3_STORAGE", "false")
    storage.upload_file("videos/42.focus-v1.bin", source, "application/octet-stream")
    source.write_bytes(b"replacement")
    storage.upload_file("videos/42.focus-v1.bin", source, "application/octet-stream")
    assert storage.resolve_local_media_path("videos/42.focus-v1.bin").read_bytes() == b"replacement"
    storage.delete_object("videos/42.focus-v1.bin")
    assert list((tmp_path / "media/videos").iterdir()) == []


def test_object_storage_upload_uses_file_body_and_one_put(tmp_path, monkeypatch):
    source = tmp_path / "focus.bin"
    source.write_bytes(b"image pack")
    client = MagicMock()
    def put(**kwargs):
        assert kwargs["Body"].read() == b"image pack"
        assert kwargs["ContentLength"] == 10
        assert kwargs["Key"] == "media/videos/focus.bin"
    client.put_object.side_effect = put
    monkeypatch.setenv("USE_S3_STORAGE", "true")
    monkeypatch.setenv("R2_BUCKET_NAME", "test-bucket")
    monkeypatch.setattr(storage, "_s3_client", lambda: client)
    storage.upload_file("videos/focus.bin", source, "application/octet-stream")
    client.put_object.assert_called_once()
