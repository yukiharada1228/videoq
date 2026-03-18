"""Unit tests for CreateVideoUseCase using in-memory fakes only."""

from contextlib import contextmanager
from dataclasses import dataclass
from typing import Callable
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.user.entities import UserEntity
from app.domain.video.dto import CreateVideoParams, UpdateVideoParams
from app.domain.video.entities import VideoEntity
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.dto import CreateVideoInput
from app.use_cases.video.exceptions import FileSizeExceeded, ResourceNotFound, VideoLimitExceeded


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
            video_limit=None,
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

    def test_raises_video_limit_exceeded_when_limit_zero(self):
        self.user_repo.get_by_id.return_value.video_limit = 0
        with self.assertRaises(VideoLimitExceeded):
            self.use_case.execute(self.user_id, self._input())

    def test_raises_video_limit_exceeded_when_limit_reached(self):
        self.user_repo.get_by_id.return_value.video_limit = 2
        self._seed_videos(2)

        with self.assertRaises(VideoLimitExceeded):
            self.use_case.execute(self.user_id, self._input())

    def test_allows_upload_when_within_limit(self):
        self.user_repo.get_by_id.return_value.video_limit = 3
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
            video_limit=None,
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
            video_limit=None,
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
