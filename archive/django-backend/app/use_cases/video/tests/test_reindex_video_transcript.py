"""Unit tests for ReindexVideoTranscriptUseCase."""

from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.video.entities import VideoEntity
from app.use_cases.video.reindex_video_transcript import ReindexVideoTranscriptUseCase


class ReindexVideoTranscriptUseCaseTests(TestCase):
    def setUp(self):
        self.video_repo = MagicMock()
        self.vector_store_gateway = MagicMock()
        self.vector_indexing_gateway = MagicMock()
        self.use_case = ReindexVideoTranscriptUseCase(
            self.video_repo,
            self.vector_store_gateway,
            self.vector_indexing_gateway,
        )

    def test_deletes_and_reindexes_when_transcript_present(self):
        video = VideoEntity(
            id=5,
            user_id=10,
            title="My Video",
            transcript="1\n00:00:00,000 --> 00:00:05,000\nHello world",
            status="completed",
        )
        self.video_repo.get_by_id_for_task.return_value = video

        self.use_case.execute(5)

        self.vector_store_gateway.delete_video_vectors.assert_called_once_with(5)
        self.vector_indexing_gateway.index_video_transcript.assert_called_once_with(
            5, 10, "My Video",
            "1\n00:00:00,000 --> 00:00:05,000\nHello world",
            api_key=None,
        )

    def test_only_deletes_when_transcript_empty(self):
        video = VideoEntity(
            id=5,
            user_id=10,
            title="My Video",
            transcript="",
            status="completed",
        )
        self.video_repo.get_by_id_for_task.return_value = video

        self.use_case.execute(5)

        self.vector_store_gateway.delete_video_vectors.assert_called_once_with(5)
        self.vector_indexing_gateway.index_video_transcript.assert_not_called()

    def test_only_deletes_when_transcript_is_none(self):
        video = VideoEntity(
            id=5,
            user_id=10,
            title="My Video",
            transcript=None,
            status="completed",
        )
        self.video_repo.get_by_id_for_task.return_value = video

        self.use_case.execute(5)

        self.vector_store_gateway.delete_video_vectors.assert_called_once_with(5)
        self.vector_indexing_gateway.index_video_transcript.assert_not_called()

    def test_no_op_when_video_not_found(self):
        self.video_repo.get_by_id_for_task.return_value = None

        self.use_case.execute(99)

        self.vector_store_gateway.delete_video_vectors.assert_not_called()
        self.vector_indexing_gateway.index_video_transcript.assert_not_called()

    def test_propagates_indexing_error(self):
        video = VideoEntity(
            id=5,
            user_id=10,
            title="My Video",
            transcript="some transcript",
            status="completed",
        )
        self.video_repo.get_by_id_for_task.return_value = video
        self.vector_indexing_gateway.index_video_transcript.side_effect = RuntimeError("oops")

        with self.assertRaises(RuntimeError):
            self.use_case.execute(5)

    def test_propagates_delete_error(self):
        video = VideoEntity(
            id=5,
            user_id=10,
            title="My Video",
            transcript="some transcript",
            status="completed",
        )
        self.video_repo.get_by_id_for_task.return_value = video
        self.vector_store_gateway.delete_video_vectors.side_effect = RuntimeError("oops")

        with self.assertRaises(RuntimeError):
            self.use_case.execute(5)
