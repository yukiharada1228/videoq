"""Tests for ResolveProtectedMediaUseCase."""

import io
import unittest

from app.use_cases.media.resolve_protected_media import (
    ResolveProtectedMediaInput,
    ResolveProtectedMediaUseCase,
)
from app.use_cases.shared.exceptions import ResourceNotFound


class _FakeMediaRepo:
    def __init__(self, video_id=1, owned=True, in_group=True):
        self.video_id = video_id
        self.owned = owned
        self.in_group = in_group

    def find_video_id_by_file_path(self, path: str):
        return self.video_id

    def is_video_owned_by_user(self, video_id: int, user_id: int) -> bool:
        return self.owned

    def is_video_in_group(self, video_id: int, group_id: int) -> bool:
        return self.in_group


class _FakeStorage:
    def __init__(self, exists: bool):
        self._exists = exists

    def exists(self, path: str) -> bool:
        return self._exists

    def open(self, path: str, mode: str = "rb"):
        return io.BytesIO(b"dummy")


class ResolveProtectedMediaUseCaseTests(unittest.TestCase):
    def test_missing_file_raises_not_found(self):
        use_case = ResolveProtectedMediaUseCase(
            media_repo=_FakeMediaRepo(),
            media_storage=_FakeStorage(exists=False),
        )

        with self.assertRaises(ResourceNotFound):
            use_case.execute(
                ResolveProtectedMediaInput(path="videos/test.mp4", user_id=1)
            )

    def test_owner_access_returns_redirect_metadata(self):
        use_case = ResolveProtectedMediaUseCase(
            media_repo=_FakeMediaRepo(video_id=10, owned=True),
            media_storage=_FakeStorage(exists=True),
        )

        result = use_case.execute(
            ResolveProtectedMediaInput(path="videos/test.mp4", user_id=1)
        )

        self.assertEqual(result.redirect_path, "/api/protected_media/videos/test.mp4")
        self.assertEqual(result.content_type, "video/mp4")

    def test_group_access_denied_raises_not_found(self):
        use_case = ResolveProtectedMediaUseCase(
            media_repo=_FakeMediaRepo(video_id=10, in_group=False),
            media_storage=_FakeStorage(exists=True),
        )

        with self.assertRaises(ResourceNotFound):
            use_case.execute(
                ResolveProtectedMediaInput(path="videos/test.mp4", group_id=99)
            )
