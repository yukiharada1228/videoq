"""Unit tests for DeleteVideoUseCase."""

from contextlib import contextmanager
from typing import Callable
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.video.entities import VideoEntity
from app.use_cases.video.delete_video import DeleteVideoUseCase
from app.use_cases.video.exceptions import ResourceNotFound


class _FakeTransactionPort:
    @contextmanager
    def atomic(self):
        yield

    def on_commit(self, fn: Callable[[], None]) -> None:
        fn()


class DeleteVideoUseCaseTests(TestCase):
    def setUp(self):
        self.video_repo = MagicMock()
        self.vector_gateway = MagicMock()
        self.use_case = DeleteVideoUseCase(
            self.video_repo,
            self.vector_gateway,
            _FakeTransactionPort(),
        )

    def test_raises_when_video_not_found(self):
        self.video_repo.get_by_id.return_value = None

        with self.assertRaises(ResourceNotFound):
            self.use_case.execute(video_id=1, user_id=10)

    def test_deletes_video_and_vectors(self):
        video = VideoEntity(id=7, user_id=10, title="t", status="pending")
        self.video_repo.get_by_id.return_value = video

        self.use_case.execute(video_id=7, user_id=10)

        self.video_repo.delete.assert_called_once_with(video)
        self.vector_gateway.delete_video_vectors.assert_called_once_with(7)

    def test_vector_cleanup_failure_does_not_break_deletion(self):
        video = VideoEntity(id=7, user_id=10, title="t", status="pending")
        self.video_repo.get_by_id.return_value = video
        self.vector_gateway.delete_video_vectors.side_effect = RuntimeError("boom")

        self.use_case.execute(video_id=7, user_id=10)

        self.video_repo.delete.assert_called_once_with(video)
