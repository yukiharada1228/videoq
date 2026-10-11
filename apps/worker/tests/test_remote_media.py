"""Exercise the real seekable FFmpeg input without storing a large source locally."""

from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import shutil
import ssl
import struct
import subprocess
from threading import Thread
from unittest.mock import MagicMock

import pytest

from worker_python.pipeline import storage, transcription
from worker_python.pipeline.focus_frames import build_focus_cache
from worker_python.pipeline.media_process import media_input_args
from worker_python.pipeline.visual_frames import build_frame_cache


def test_remote_source_signs_each_reader_and_never_downloads(monkeypatch):
    monkeypatch.setenv("USE_S3_STORAGE", "true")
    monkeypatch.setenv("R2_BUCKET_NAME", "media-bucket")
    monkeypatch.setenv("FFMPEG_PROCESS_TIMEOUT_SECONDS", "600")
    client = MagicMock()
    client.generate_presigned_url.side_effect = [
        "https://storage.invalid/object?signature=first",
        "https://storage.invalid/object?signature=second",
    ]
    monkeypatch.setattr(storage, "_s3_client", lambda: client)
    source = storage.resolve_media_input("videos/45gb.mkv")
    first, second = media_input_args(source), media_input_args(source)
    assert first[-1].endswith("signature=first")
    assert second[-1].endswith("signature=second")
    assert first[first.index("-protocol_whitelist") + 1] == "https,tls,tcp"
    assert first[first.index("-tls_verify") + 1] == "1"
    assert "file" not in first[first.index("-protocol_whitelist") + 1].split(",")
    client.generate_presigned_url.assert_called_with(
        "get_object", Params={"Bucket": "media-bucket", "Key": "media/videos/45gb.mkv"}, ExpiresIn=900,
    )
    assert client.close.call_count == 2
    client.download_file.assert_not_called()


def test_local_source_is_used_in_place(monkeypatch, tmp_path):
    monkeypatch.setenv("USE_S3_STORAGE", "false")
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    path = tmp_path / "clip.mkv"
    path.write_bytes(b"media")
    assert storage.resolve_media_input("clip.mkv") == path
    # A plain string is never promoted to a trusted remote input.
    args = media_input_args("https://untrusted.invalid/clip.mkv")
    assert args[args.index("-protocol_whitelist") + 1] == "file"


@pytest.mark.parametrize("fails", [False, True])
def test_remote_source_closes_signing_client(monkeypatch, fails):
    monkeypatch.setenv("R2_BUCKET_NAME", "media-bucket")
    client = MagicMock()
    if fails:
        client.generate_presigned_url.side_effect = RuntimeError("signing failed")
    monkeypatch.setattr(storage, "_s3_client", lambda: client)
    source = storage.ObjectMediaSource("clip.mkv")
    if fails:
        with pytest.raises(RuntimeError, match="signing failed"):
            source.presigned_url(900)
    else:
        source.presigned_url(900)
    client.close.assert_called_once()


@contextmanager
def range_server(path, *, disconnect_once=False, fail_after_disconnect=False, disconnect_at=1024, tls_context=None):
    """An object store stand-in recording actual Range requests and byte counts."""
    requests = []
    sent = []
    disconnected = []
    size = path.stat().st_size

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            requests.append((self.path, self.headers.get("Range")))
            if fail_after_disconnect and disconnected:
                self.send_error(503)
                return
            match = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
            start = int(match[1]) if match else 0
            end = min(int(match[2]), size - 1) if match and match[2] else size - 1
            self.send_response(206 if match else 200)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(end - start + 1))
            if match:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            try:
                with path.open("rb") as body:
                    body.seek(start)
                    remaining = end - start + 1
                    while remaining:
                        if sum(sent) >= 32 * 1024 * 1024:
                            return  # Fail boundedly if a reader stops seeking.
                        interrupt = disconnect_once and not disconnected
                        data = body.read(min(disconnect_at if interrupt else 65536, remaining))
                        if not data:
                            break
                        self.wfile.write(data)
                        sent.append(len(data))
                        remaining -= len(data)
                        if interrupt:
                            disconnected.append(True)
                            return  # Close before Content-Length: reader must resume.
            except (BrokenPipeError, ConnectionResetError):
                pass  # FFmpeg closes its current range when seeking elsewhere.

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    if tls_context:
        server.socket = tls_context.wrap_socket(server.socket, server_side=True)
    thread = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    thread.start()
    try:
        scheme = "https" if tls_context else "http"
        yield f"{scheme}://127.0.0.1:{server.server_port}/clip{path.suffix}?signature=test-only", requests, sent
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.fixture
def ffmpeg():
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        pytest.skip("FFmpeg and ffprobe are required")


def create_video(path, duration=2):
    subprocess.run([
        "ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"color=c=blue:s=64x64:r=5:d={duration}",
        "-f", "lavfi", "-i", f"sine=duration={duration}", "-c:v", "mpeg4", "-threads", "1",
        "-c:a", "aac", "-shortest", str(path),
    ], check=True, timeout=30)


def enlarge_mp4_without_allocating_source_bytes(path):
    """Valid 45.16 GB MP4: retain mdat offsets; move moov past a sparse free box."""
    original = path.read_bytes()
    offset = 0
    while original[offset + 4:offset + 8] != b"moov":
        offset += struct.unpack_from(">I", original, offset)[0]
    moov = original[offset:]
    total = 45_160_000_000
    gap = total - len(original)
    with path.open("wb") as out:
        out.write(original[:offset])
        out.write(struct.pack(">I4sQ", 1, b"free", gap))
        out.seek(offset + gap)
        out.write(moov)
    assert path.stat().st_size == total
    assert path.stat().st_blocks * 512 < 1024 * 1024


def enlarge_mkv_without_allocating_source_bytes(path):
    """Extend the Matroska Segment with a sparse Void, keeping all seek offsets."""
    original = path.read_bytes()
    segment = original.index(b"\x18\x53\x80\x67")
    size_offset = segment + 4
    assert original[size_offset] == 1  # FFmpeg reserves an eight-byte EBML size.
    total = 45_160_000_000
    gap = total - len(original)
    with path.open("r+b") as out:
        out.seek(size_offset)
        out.write(((1 << 56) | (total - size_offset - 8)).to_bytes(8))
        out.seek(len(original))
        out.write(b"\xec" + ((1 << 56) | (gap - 9)).to_bytes(8))
        out.seek(total - 1)
        out.write(b"\x00")
    assert path.stat().st_size == total
    assert path.stat().st_blocks * 512 < 1024 * 1024


def test_large_mkv_duration_probe_does_not_read_the_whole_object(ffmpeg, monkeypatch, tmp_path):
    original = tmp_path / "original.mkv"
    create_video(original, duration=12)
    enlarge_mkv_without_allocating_source_bytes(original)
    with range_server(original) as (url, _, sent):
        monkeypatch.setattr(storage.ObjectMediaSource, "presigned_url", lambda *_args, **_kwargs: url)
        duration = transcription._ffprobe_duration(storage.ObjectMediaSource("original.mkv"))
        assert 11.9 <= duration <= 12.1
        assert sum(sent) < 32 * 1024 * 1024


@pytest.mark.parametrize("start,duration", [(0, 5), (5, 5), (10, 2)])
def test_remote_audio_interval_seeks_and_keeps_source_timestamps(ffmpeg, monkeypatch, tmp_path, start, duration):
    original = tmp_path / "interval.mkv"
    create_video(original, duration=12)
    client = MagicMock()
    monkeypatch.setattr(transcription, "_whisper_client", lambda: (client, "test"))
    def transcribe(_client, audio, model, *, offset):
        assert model == "test"
        assert offset == start
        assert duration <= transcription._ffprobe_duration(audio) <= duration + 0.2
        assert audio.stat().st_size < 100_000
        return [
            {"start": start - 0.5, "end": start + duration + 1, "text": "speech"},
            {"start": start + duration + 1, "end": start + duration + 2, "text": "outside"},
        ]
    monkeypatch.setattr(transcription, "_whisper_file", transcribe)
    with range_server(original) as (url, requests, _):
        monkeypatch.setattr(storage.ObjectMediaSource, "presigned_url", lambda *_args, **_kwargs: url)
        assert transcription.transcribe_audio_interval(storage.ObjectMediaSource("interval.mkv"), start, duration) == [
            {"start": start, "end": start + duration, "text": "speech"},
        ]
        assert any(value is not None for _, value in requests)
    client.__exit__.assert_called_once()


@pytest.mark.parametrize("suffix,large", [("mp4", True), ("mkv", False)])
def test_ffmpeg_remote_probe_audio_and_visuals_use_ranges(ffmpeg, monkeypatch, tmp_path, suffix, large):
    original = tmp_path / f"original.{suffix}"
    create_video(original)
    if large:
        enlarge_mp4_without_allocating_source_bytes(original)
    output = tmp_path / "audio.mp3"
    with range_server(original) as (url, requests, sent):
        monkeypatch.setattr(storage.ObjectMediaSource, "presigned_url", lambda *_args, **_kwargs: url)
        source = storage.ObjectMediaSource(f"videos/original.{suffix}")
        duration = transcription._ffprobe_duration(source)
        assert 1.9 <= duration <= 2.1
        transcription._ffmpeg_extract_mp3(source, output)
        assert output.stat().st_size > 0
        assert transcription._ffprobe_duration(output) >= 1.9
        assert json.loads(build_frame_cache(source, 42, duration))["frames"]
        with build_focus_cache(source, 42, duration) as pack:
            assert pack.read_bytes().startswith(b"VQFOC001")
        assert requests and all(item[1] for item in requests)
        if large:
            assert any(int(re.search(r"bytes=(\d+)", item[1])[1]) > 5 * 1024**3 for item in requests)
        assert sum(sent) < 32 * 1024 * 1024
    assert sorted(p.name for p in tmp_path.iterdir()) == ["audio.mp3", f"original.{suffix}"]


def test_interrupted_object_read_resumes_without_losing_audio(ffmpeg, monkeypatch, tmp_path):
    original = tmp_path / "original.mkv"
    create_video(original)
    output = tmp_path / "audio.mp3"
    with range_server(original, disconnect_once=True) as (url, requests, _):
        monkeypatch.setattr(storage.ObjectMediaSource, "presigned_url", lambda *_args, **_kwargs: url)
        transcription._ffmpeg_extract_mp3(storage.ObjectMediaSource("original.mkv"), output)
        assert any(item[1] == "bytes=1024-" for item in requests)
    assert transcription._ffprobe_duration(output) >= 1.9


@pytest.mark.parametrize("disconnect_at", [1024, 16384])
def test_unrecoverable_object_read_does_not_accept_partial_audio(ffmpeg, monkeypatch, tmp_path, disconnect_at):
    original = tmp_path / "original.mkv"
    create_video(original, duration=12)
    with range_server(original, disconnect_once=True, fail_after_disconnect=True, disconnect_at=disconnect_at) as (url, _, _):
        monkeypatch.setattr(storage.ObjectMediaSource, "presigned_url", lambda *_args, **_kwargs: url)
        with pytest.raises(RuntimeError, match="ffmpeg failed") as error:
            transcription._ffmpeg_extract_mp3(storage.ObjectMediaSource("original.mkv"), tmp_path / "audio.mp3")
        assert "signature=test-only" not in str(error.value)


@pytest.mark.parametrize("trusted", [False, True])
def test_https_media_requires_a_trusted_certificate(ffmpeg, monkeypatch, tmp_path, trusted):
    from datetime import datetime, timedelta, timezone
    from ipaddress import ip_address
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(x509.NameOID.COMMON_NAME, "media-test")])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
        .public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1)).not_valid_after(now + timedelta(hours=1))
        .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ip_address("127.0.0.1"))]), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256()))
    cert_path, key_path = tmp_path / "ca.pem", tmp_path / "key.pem"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert_path, key_path)
    original = tmp_path / "original.mkv"
    create_video(original)
    if trusted:
        monkeypatch.setenv("SSL_CERT_FILE", str(cert_path))
    with range_server(original, tls_context=context) as (url, requests, _):
        monkeypatch.setattr(storage.ObjectMediaSource, "presigned_url", lambda *_args, **_kwargs: url)
        if trusted:
            assert transcription._ffprobe_duration(storage.ObjectMediaSource("original.mkv")) >= 1.9
            assert requests
        else:
            with pytest.raises(RuntimeError, match="[Cc]ertificate") as error:
                transcription._ffprobe_duration(storage.ObjectMediaSource("original.mkv"))
            assert "signature=test-only" not in str(error.value)
            assert not requests


@pytest.mark.parametrize("playlist", [
    "ffconcat version 1.0\nfile 'http://127.0.0.1:1/external.mp4'\n",
    "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://127.0.0.1:1/segment.ts\n#EXT-X-ENDLIST\n",
])
def test_remote_playlists_cannot_open_nested_inputs(ffmpeg, monkeypatch, tmp_path, playlist):
    original = tmp_path / "disguised.mp4"
    original.write_text(playlist)
    with range_server(original) as (url, requests, _):
        monkeypatch.setattr(storage.ObjectMediaSource, "presigned_url", lambda *_args, **_kwargs: url)
        with pytest.raises(RuntimeError, match="not on whitelist|Invalid data found") as error:
            transcription._ffprobe_duration(storage.ObjectMediaSource("disguised.mp4"))
        assert "signature=test-only" not in str(error.value)
        assert requests


def test_uploaded_pipeline_uses_remote_source_and_reserves_before_extraction(monkeypatch):
    monkeypatch.setenv("USE_S3_STORAGE", "true")
    monkeypatch.setenv("VIDEO_VISUAL_ENABLED", "false")
    events = []
    source = storage.ObjectMediaSource("videos/45gb.mkv")
    monkeypatch.setattr(transcription, "_ffprobe_duration", lambda path: events.append(("probe", path)) or 120.5)
    monkeypatch.setattr(transcription, "_ffmpeg_extract_mp3", lambda path, _: events.append(("extract", path)))
    monkeypatch.setattr(transcription, "_whisper_transcribe", lambda _: [{"start": 0, "end": 1, "text": "Caption"}])
    download = MagicMock(side_effect=AssertionError("Full download is forbidden"))
    monkeypatch.setattr(storage, "download_to_path", download)
    transcript = transcription._transcribe_uploaded(source.file_key, lambda seconds: events.append(("reserve", seconds)))
    assert "Caption" in transcript
    assert events == [("probe", source), ("reserve", 121), ("extract", source)]
    download.assert_not_called()
