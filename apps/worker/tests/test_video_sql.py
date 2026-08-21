from __future__ import annotations

from worker_python.video_sql import _row_to_video


def _row(**overrides) -> dict:
    row = {
        "id": 109,
        # users.id became a UUID text PK in migration 0006_user_id_uuid.
        "user_id": "1f0c6a5e-6d3c-4a1b-9f2e-8c7d5b4a3e21",
        "title": "sample",
        "transcript": None,
        "status": "uploaded",
        "source_type": "uploaded",
        "file": "videos/109.mp4",
        "youtube_video_id": None,
        "error_message": None,
    }
    row.update(overrides)
    return row


def test_row_to_video_keeps_uuid_user_id_as_text() -> None:
    video = _row_to_video(_row())

    assert video.user_id == "1f0c6a5e-6d3c-4a1b-9f2e-8c7d5b4a3e21"
    assert video.id == 109


def test_row_to_video_normalises_optional_columns() -> None:
    video = _row_to_video(_row(file="", transcript="", error_message=None))

    assert video.file_key is None
    assert video.transcript is None
    assert video.error_message == ""
