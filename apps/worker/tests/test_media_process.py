import json
from pathlib import Path
import resource
import shutil
import subprocess
import sys

import pytest

from worker_python.pipeline.media_process import run_media_process
from worker_python.pipeline.transcription import _ffmpeg_extract_mp3, _ffprobe_duration


def test_limits_apply_only_to_the_child(monkeypatch):
    before = resource.getrlimit(resource.RLIMIT_CPU)
    monkeypatch.setenv("MEDIA_PROCESS_CPU_TIME_LIMIT_SECONDS", "2")
    monkeypatch.setenv("MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB", "1")
    monkeypatch.setenv("MEDIA_PROCESS_MEMORY_LIMIT_MB", "256")
    result = run_media_process([sys.executable, "-c", """
import json, resource
print(json.dumps([resource.getrlimit(kind) for kind in
    [resource.RLIMIT_CPU, resource.RLIMIT_FSIZE, resource.RLIMIT_CORE, resource.RLIMIT_AS]]))
"""])
    assert result.returncode == 0, result.stderr
    limits = json.loads(result.stdout)
    assert limits[:3] == [[2, 2], [1024**2, 1024**2], [0, 0]]
    if sys.platform == "linux":
        assert limits[3] == [256 * 1024**2, 256 * 1024**2]
    assert resource.getrlimit(resource.RLIMIT_CPU) == before


def test_wall_clock_timeout(monkeypatch):
    monkeypatch.setenv("FFMPEG_PROCESS_TIMEOUT_SECONDS", "1")
    with pytest.raises(RuntimeError, match="time limit"):
        run_media_process([sys.executable, "-c", "import time; time.sleep(60)"])


def test_output_file_size_limit(monkeypatch, tmp_path):
    monkeypatch.setenv("MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB", "1")
    dest = tmp_path / "output"
    result = run_media_process([sys.executable, "-c",
        "import pathlib, sys; pathlib.Path(sys.argv[1]).write_bytes(b'x' * (2 * 1024**2))", str(dest)])
    assert result.returncode != 0
    assert dest.stat().st_size <= 1024**2


def test_per_call_output_limit_is_enforced_without_changing_parent(tmp_path):
    dest = tmp_path / "bounded"
    before = resource.getrlimit(resource.RLIMIT_FSIZE)
    result = run_media_process([sys.executable, "-c",
        "import pathlib, sys; pathlib.Path(sys.argv[1]).write_bytes(b'x'*10000)", str(dest)], max_output_bytes=1024)
    assert result.returncode != 0
    assert dest.stat().st_size <= 1024
    assert resource.getrlimit(resource.RLIMIT_FSIZE) == before


def test_diagnostics_are_bounded():
    result = run_media_process([sys.executable, "-c", "import sys; sys.stderr.write('x'*10000)"])
    assert result.returncode == 0
    assert len(result.stderr) == 2000
    with pytest.raises(RuntimeError, match="too much output"):
        run_media_process([sys.executable, "-c", "print('x'*5000)"])


@pytest.mark.parametrize("duration", ["nan", "inf", "0", "-1"])
def test_invalid_durations_cannot_skip_processing_quota(monkeypatch, duration):
    from worker_python.pipeline import transcription
    monkeypatch.setattr(transcription, "run_media_process", lambda _: subprocess.CompletedProcess([], 0, duration, ""))
    with pytest.raises(RuntimeError, match="invalid media duration"):
        _ffprobe_duration(Path("clip.mp4"))


@pytest.fixture
def ffmpeg():
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg and ffprobe are required for media integration tests")


@pytest.mark.parametrize("suffix,codec", [("mp4", "aac"), ("mkv", "pcm_s16le"), ("webm", "libopus")])
def test_regular_media_still_probes_extracts_and_splits(ffmpeg, tmp_path, suffix, codec):
    from worker_python.pipeline.transcription import _split_audio_chunks
    video = tmp_path / f"clip.{suffix}"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=duration=0.2",
        "-c:a", codec, str(video)], check=True, timeout=15)
    assert _ffprobe_duration(video) > 0
    audio = tmp_path / "audio.mp3"
    _ffmpeg_extract_mp3(video, audio)
    assert audio.stat().st_size > 0
    chunks = _split_audio_chunks(audio, 600)
    offset, path = next(chunks)
    assert offset == 0
    assert path.stat().st_size > 0
    chunks.close()
    assert not path.exists()


@pytest.mark.parametrize("playlist", [
    "ffconcat version 1.0\nfile 'other.mp4'\nduration 1\n",
    "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:1/segment.ts\n#EXT-X-ENDLIST\n",
])
def test_disguised_playlists_are_rejected_before_opening_references(ffmpeg, tmp_path, playlist):
    path = tmp_path / "upload.mp4"
    path.write_text(playlist)
    # New FFmpeg versions can reject HLS by its disguised extension before the
    # demuxer whitelist is checked; neither result opens its referenced URL.
    with pytest.raises(RuntimeError, match="not on whitelist|Invalid data found"):
        _ffprobe_duration(path)
