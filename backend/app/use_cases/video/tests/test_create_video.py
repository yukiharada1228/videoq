"""Unit tests for CreateVideoUseCase using in-memory fakes only."""

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.billing.exceptions import StorageLimitExceeded
from app.domain.user.entities import UserEntity
from app.domain.video.dto import CreateVideoParams, UpdateVideoParams
from app.domain.video.entities import VideoEntity
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.dto import CreateVideoInput
from app.use_cases.video.exceptions import FileSizeExceeded, ResourceNotFound


@dataclass
class FakeUploadedFile:
    name: str = "test.mp4"
    content: bytes = b"fake video content"
    size: int = 18

    def read(self, size: int = -1) -> bytes:
        return self.content if size < 0 else self.content[:size]

    def chunks(self):
        yield self.content


class FakeVideoRepository:
    def __init__(self):
        self._videos = {}
        self._next_id = 1

    def get_by_id(self, video_id: int, user_id: int):
        video = self._videos.get(video_id)
        if video is None or video.user_id != user_id:
            return None
        return video

    def list_for_user(
        self,
        user_id: int,
        criteria=None,
    ):
        del criteria
        return [video for video in self._videos.values() if video.user_id == user_id]

    def create(self, user_id: int, params: CreateVideoParams) -> VideoEntity:
        video = VideoEntity(
            id=self._next_id,
            user_id=user_id,
            title=params.title,
            description=params.description,
            status="pending",
            file_key=params.upload_file.name,
        )
        self._videos[self._next_id] = video
        self._next_id += 1
        return video

    def update(self, video: VideoEntity, params: UpdateVideoParams) -> VideoEntity:
        if params.title is not None:
            video.title = params.title
        if params.description is not None:
            video.description = params.description
        return video

    def delete(self, video: VideoEntity) -> None:
        self._videos.pop(video.id, None)

    def count_for_user(self, user_id: int) -> int:
        return len([v for v in self._videos.values() if v.user_id == user_id])

    def get_file_keys_for_ids(self, video_ids, user_id: int):
        return {
            v.id: v.file_key
            for v in self._videos.values()
            if v.id in video_ids and v.user_id == user_id
        }

    def list_completed_with_transcript(self):
        return [
            v
            for v in self._videos.values()
            if v.status == "completed" and (v.transcript or "") != ""
        ]

    def get_by_id_for_task(self, video_id: int):
        return self._videos.get(video_id)

    def update_status(self, video_id: int, status: str, error_message: str = "") -> None:
        video = self._videos.get(video_id)
        if video is None:
            return
        video.status = status
        video.error_message = error_message

    def save_transcript(self, video_id: int, transcript: str) -> None:
        video = self._videos.get(video_id)
        if video is None:
            return
        video.transcript = transcript


class _FakeTransactionPort:
    @contextmanager
    def atomic(self):
        yield

    def on_commit(self, fn: Callable[[], None]) -> None:
        fn()


class CreateVideoUseCaseTests(TestCase):
    def setUp(self):
        self.user_id = 101
        self.user_repo = MagicMock()
        self.user_repo.get_by_id.return_value = UserEntity(
            id=self.user_id,
            username="user",
            email="user@example.com",
            is_active=True,
        )
        self.repo = FakeVideoRepository()
        self.mock_task_queue = MagicMock()
        self.use_case = CreateVideoUseCase(
            self.user_repo,
            self.repo,
            self.mock_task_queue,
            _FakeTransactionPort(),
        )

    def _input(self):
        file = FakeUploadedFile()
        return CreateVideoInput(
            file=file,
            title="Test Video",
            description="",
        )

    def _seed_videos(self, count: int) -> None:
        for i in range(count):
            self.repo.create(
                self.user_id,
                CreateVideoParams(
                    upload_file=FakeUploadedFile(
                        name=f"seed-{i}.mp4",
                        content=b"seed",
                    ),
                    title=f"Seed {i}",
                    description="",
                ),
            )

    def test_creates_video_successfully(self):
        video = self.use_case.execute(self.user_id, self._input())

        self.assertIsNotNone(video.id)
        self.assertEqual(video.title, "Test Video")
        self.assertEqual(self.repo.count_for_user(self.user_id), 1)

    def test_dispatches_transcription_task(self):
        video = self.use_case.execute(self.user_id, self._input())

        self.mock_task_queue.enqueue_transcription.assert_called_once_with(video.id)

    def test_allows_upload_with_existing_videos(self):
        self._seed_videos(1)

        video = self.use_case.execute(self.user_id, self._input())

        self.assertIsNotNone(video.id)
        self.assertEqual(self.repo.count_for_user(self.user_id), 2)

    def test_allows_unlimited_uploads(self):
        self._seed_videos(10)

        video = self.use_case.execute(self.user_id, self._input())

        self.assertIsNotNone(video.id)
        self.assertEqual(self.repo.count_for_user(self.user_id), 11)

    def test_rejects_file_exceeding_user_size_limit(self):
        self.user_repo.get_by_id.return_value = UserEntity(
            id=self.user_id,
            username="user",
            email="user@example.com",
            is_active=True,
            max_video_upload_size_mb=100,
        )
        file_size = 101 * 1024 * 1024  # 101 MB
        input_dto = CreateVideoInput(
            file=FakeUploadedFile(),
            title="Test Video",
            description="",
            file_size=file_size,
        )
        with self.assertRaises(FileSizeExceeded) as ctx:
            self.use_case.execute(self.user_id, input_dto)
        self.assertEqual(ctx.exception.limit_mb, 100)

    def test_accepts_file_within_user_size_limit(self):
        self.user_repo.get_by_id.return_value = UserEntity(
            id=self.user_id,
            username="user",
            email="user@example.com",
            is_active=True,
            max_video_upload_size_mb=1000,
        )
        file_size = 600 * 1024 * 1024  # 600 MB
        input_dto = CreateVideoInput(
            file=FakeUploadedFile(),
            title="Test Video",
            description="",
            file_size=file_size,
        )
        video = self.use_case.execute(self.user_id, input_dto)
        self.assertIsNotNone(video.id)

    def test_raises_when_user_not_found(self):
        self.user_repo.get_by_id.return_value = None

        with self.assertRaises(ResourceNotFound):
            self.use_case.execute(self.user_id, self._input())


class CreateVideoStorageBillingTests(TestCase):
    """Tests for atomic storage check-and-reserve in CreateVideoUseCase."""

    def setUp(self):
        from app.domain.user.entities import UserEntity

        self.user_id = 42
        self.user_repo = MagicMock()
        self.user_repo.get_by_id.return_value = UserEntity(
            id=self.user_id,
            username="user",
            email="user@example.com",
            is_active=True,
        )
        self.repo = FakeVideoRepository()
        self.mock_task_queue = MagicMock()
        self.mock_storage_limit_check = MagicMock()

    def _make_use_case(self, storage_limit_check_use_case=None):
        return CreateVideoUseCase(
            self.user_repo,
            self.repo,
            self.mock_task_queue,
            _FakeTransactionPort(),
            storage_limit_check_use_case=storage_limit_check_use_case,
        )

    def test_checks_and_reserves_storage_before_upload(self):
        """check_and_reserve is delegated atomically before video is created."""
        use_case = self._make_use_case(
            storage_limit_check_use_case=self.mock_storage_limit_check,
        )
        input_dto = CreateVideoInput(
            file=FakeUploadedFile(),
            title="Test",
            description="",
            file_size=1024,
        )

        use_case.execute(self.user_id, input_dto)

        self.mock_storage_limit_check.execute.assert_called_once_with(self.user_id, 1024)

    def test_rejects_upload_when_storage_limit_exceeded(self):
        self.mock_storage_limit_check.execute.side_effect = StorageLimitExceeded("Storage limit exceeded")
        use_case = self._make_use_case(
            storage_limit_check_use_case=self.mock_storage_limit_check,
        )
        input_dto = CreateVideoInput(
            file=FakeUploadedFile(),
            title="Test",
            description="",
            file_size=1024,
        )

        with self.assertRaises(StorageLimitExceeded):
            use_case.execute(self.user_id, input_dto)

        self.assertEqual(self.repo.count_for_user(self.user_id), 0)
        self.mock_task_queue.enqueue_transcription.assert_not_called()

    def test_skips_storage_check_when_no_use_case_injected(self):
        use_case = self._make_use_case(storage_limit_check_use_case=None)
        input_dto = CreateVideoInput(
            file=FakeUploadedFile(),
            title="Test",
            description="",
            file_size=1024,
        )
        # Should not raise
        use_case.execute(self.user_id, input_dto)
