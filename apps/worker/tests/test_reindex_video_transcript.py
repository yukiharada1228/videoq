from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from worker_python.tasks import reindex_video_transcript as task
from worker_python.video_sql import VideoRow


@pytest.mark.parametrize("transcript", [None, "", " \n\t\r\n "])
def test_clearing_transcript_removes_old_vectors_without_embedding(
    monkeypatch, transcript
):
    video = VideoRow(
        id=12,
        user_id="owner",
        title="Demo",
        transcript=transcript,
        status="completed",
        source_type="uploaded",
        file_key=None,
        youtube_video_id=None,
    )

    @contextmanager
    def lock(_video_id):
        yield

    @contextmanager
    def connection():
        yield MagicMock()

    monkeypatch.setattr(task, "video_vector_write_lock", lock)
    monkeypatch.setattr(task, "db_connection", connection)
    monkeypatch.setattr(task, "get_video_for_task", MagicMock(return_value=video))
    delete = MagicMock(return_value=3)
    embed = MagicMock()
    monkeypatch.setattr(task.vector_index, "delete_video_vectors", delete)
    monkeypatch.setattr(task.vector_index, "embed_texts", embed)

    task.reindex_video_transcript(12)

    delete.assert_called_once_with(12)
    embed.assert_not_called()
