"""Unit tests for UpdateVideoUseCase."""

from contextlib import contextmanager
from datetime import datetime
from typing import Callable
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.video.entities import VideoEntity
from app.use_cases.video.dto import UpdateVideoInput
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.update_video import UpdateVideoUseCase


class _FakeTransactionPort:
    @contextmanager
    def atomic(self):
        yield

    def on_commit(self, fn: Callable[[], None]) -> None:
        fn()


class UpdateVideoUseCaseTests(TestCase):
    def setUp(self):
        self.video_repo = MagicMock()
        self.vector_gateway = MagicMock()
        self.use_case = UpdateVideoUseCase(
            self.video_repo,
            self.vector_gateway,
            _FakeTransactionPort(),
        )

    def test_raises_when_video_not_found(self):
        self.video_repo.get_by_id.return_value = None

        with self.assertRaises(ResourceNotFound):
            self.use_case.execute(
                video_id=1,
                user_id=10,
                input=UpdateVideoInput(title="new"),
            )

    def test_updates_video_and_syncs_vector_title_when_title_changed(self):
        before = VideoEntity(
            id=7,
            user_id=10,
            title="old",
            status="completed",
            uploaded_at=datetime(2026, 1, 1),
        )
        after = VideoEntity(
            id=7,
            user_id=10,
            title="new",
            status="completed",
            uploaded_at=datetime(2026, 1, 1),
        )
        self.video_repo.get_by_id.return_value = before
        self.video_repo.update.return_value = after

        result = self.use_case.execute(
            video_id=7,
            user_id=10,
            input=UpdateVideoInput(title="new"),
        )

        self.assertEqual(result.title, "new")
        self.vector_gateway.update_video_title.assert_called_once_with(7, "new")

    def test_does_not_sync_vector_title_when_title_is_unchanged(self):
        video = VideoEntity(id=7, user_id=10, title="same", status="completed")
        self.video_repo.get_by_id.return_value = video
        self.video_repo.update.return_value = video

        self.use_case.execute(
            video_id=7,
            user_id=10,
            input=UpdateVideoInput(description="only description update"),
        )

        self.vector_gateway.update_video_title.assert_not_called()

    def test_vector_sync_failure_is_non_fatal(self):
        before = VideoEntity(id=7, user_id=10, title="old", status="completed")
        after = VideoEntity(id=7, user_id=10, title="new", status="completed")
        self.video_repo.get_by_id.return_value = before
        self.video_repo.update.return_value = after
        self.vector_gateway.update_video_title.side_effect = RuntimeError("boom")

        result = self.use_case.execute(
            video_id=7,
            user_id=10,
            input=UpdateVideoInput(title="new"),
        )

        self.assertEqual(result.title, "new")
        self.video_repo.update.assert_called_once()
