import pytest
from pathlib import Path
from unittest.mock import patch

from worker_python.pipeline.storage import (
    delete_object,
    download_to_path,
    object_storage_key,
)


def test_object_storage_key_prefixes_media() -> None:
    assert object_storage_key("videos/1/a.mp4") == "media/videos/1/a.mp4"


def test_object_storage_key_idempotent() -> None:
    assert object_storage_key("media/videos/1/a.mp4") == "media/videos/1/a.mp4"


def test_object_storage_key_strips_leading_slash() -> None:
    assert object_storage_key("/videos/1/a.mp4") == "media/videos/1/a.mp4"


@pytest.mark.parametrize("same_path", [False, True])
def test_download_local_media_preserves_source_and_content(
    tmp_path, monkeypatch, same_path
) -> None:
    monkeypatch.setenv("USE_S3_STORAGE", "False")
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    source = tmp_path / "video.mp4"
    content = b"video-data\x00\xff" * 65536
    source.write_bytes(content)
    destination = source if same_path else tmp_path / "copy" / "video.mp4"

    assert download_to_path("video.mp4", destination) == destination
    assert destination.read_bytes() == content
    assert source.read_bytes() == content


@pytest.mark.parametrize("exists", [False, True])
def test_local_media_deletion_can_be_retried(tmp_path, monkeypatch, exists):
    monkeypatch.setenv("USE_S3_STORAGE", "false")
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    media = tmp_path / "video.mp4"
    if exists:
        media.write_bytes(b"video")
    delete_object("video.mp4")
    delete_object("video.mp4")
    assert not media.exists()


def test_local_delete_failure_propagates_so_account_deletion_can_retry(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("USE_S3_STORAGE", "false")
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    media = tmp_path / "video.mp4"
    media.write_bytes(b"video")
    with patch.object(Path, "unlink", side_effect=PermissionError("File is locked")):
        with pytest.raises(PermissionError, match="File is locked"):
            delete_object("video.mp4")
    assert media.read_bytes() == b"video"
