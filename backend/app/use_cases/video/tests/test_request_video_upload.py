"""Unit tests for RequestVideoUploadUseCase — per-user file size limit."""

from contextlib import contextmanager
from typing import Callable, Generator
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.user.entities import UserEntity
from app.domain.video.entities import VideoEntity
from app.use_cases.video.dto import RequestUploadInput
from app.use_cases.video.request_video_upload import RequestVideoUploadUseCase


class _FakeTransactionPort:
    @contextmanager
    def atomic(self) -> Generator[None, None, None]:
        yield

    def on_commit(self, fn: Callable[[], None]) -> None:
        fn()


class _FakeVideoRepository:
    def __init__(self):
        self._next_id = 1

    def count_for_user(self, user_id: int) -> int:
        return 0

    def create_pending(self, user_id, params):
        video = VideoEntity(
            id=self._next_id,
            user_id=user_id,
            title=params.title,
            description=params.description,
            status="uploading",
            file_key=params.file_key,
        )
        self._next_id += 1
        return video


class _FakeUploadGateway:
    def generate_upload_url(self, file_key: str, content_type: str) -> str:
        return f"https://storage.example.com/{file_key}"


class RequestVideoUploadUseCaseTests(TestCase):
    def _make_use_case(self, max_video_upload_size_mb=500):
        user = UserEntity(
            id=1,
            username="user",
            email="user@example.com",
            is_active=True,
            video_limit=None,
            max_video_upload_size_mb=max_video_upload_size_mb,
        )
        user_repo = MagicMock()
        user_repo.get_by_id.return_value = user
        return RequestVideoUploadUseCase(
            user_repo,
            _FakeVideoRepository(),
            _FakeUploadGateway(),
            _FakeTransactionPort(),
        )

    def _valid_input(self, file_size: int) -> RequestUploadInput:
        return RequestUploadInput(
            filename="test.mp4",
            content_type="video/mp4",
            file_size=file_size,
            title="Test",
        )

    def test_rejects_file_exceeding_user_size_limit(self):
        use_case = self._make_use_case(max_video_upload_size_mb=100)
        input_dto = self._valid_input(file_size=101 * 1024 * 1024)

        from app.use_cases.video.exceptions import FileSizeExceeded

        with self.assertRaises(FileSizeExceeded) as ctx:
            use_case.execute(1, input_dto)
        self.assertEqual(ctx.exception.limit_mb, 100)

    def test_accepts_file_within_user_size_limit(self):
        use_case = self._make_use_case(max_video_upload_size_mb=1000)
        input_dto = self._valid_input(file_size=600 * 1024 * 1024)

        result = use_case.execute(1, input_dto)
        self.assertIsNotNone(result.video)
        self.assertIn("https://storage.example.com/", result.upload_url)
