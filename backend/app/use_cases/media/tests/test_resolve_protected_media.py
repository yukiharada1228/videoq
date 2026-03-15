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


class _TrackingStorage:
    """ファイルシステムアクセスの呼び出しを追跡するストレージ。"""

    def __init__(self):
        self.exists_called = False
        self.open_called = False

    def exists(self, path: str) -> bool:
        self.exists_called = True
        return False

    def open(self, path: str, mode: str = "rb"):
        self.open_called = True
        return io.BytesIO(b"")


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

    def test_dotdot_path_raises_not_found_without_filesystem_access(self):
        """../secret のようなパスはストレージを呼び出す前に拒否する。"""
        storage = _TrackingStorage()
        use_case = ResolveProtectedMediaUseCase(
            media_repo=_FakeMediaRepo(),
            media_storage=storage,
        )

        with self.assertRaises(ResourceNotFound):
            use_case.execute(
                ResolveProtectedMediaInput(path="../secret", user_id=1)
            )

        self.assertFalse(storage.exists_called, "exists() must not be called for traversal paths")
        self.assertFalse(storage.open_called, "open() must not be called for traversal paths")

    def test_double_dotdot_to_etc_passwd_raises_not_found_without_filesystem_access(self):
        """../../etc/passwd のようなパスはストレージを呼び出す前に拒否する。"""
        storage = _TrackingStorage()
        use_case = ResolveProtectedMediaUseCase(
            media_repo=_FakeMediaRepo(),
            media_storage=storage,
        )

        with self.assertRaises(ResourceNotFound):
            use_case.execute(
                ResolveProtectedMediaInput(path="../../etc/passwd", user_id=1)
            )

        self.assertFalse(storage.exists_called)
        self.assertFalse(storage.open_called)

    def test_absolute_path_raises_not_found_without_filesystem_access(self):
        """/etc/passwd のような絶対パスはストレージを呼び出す前に拒否する。"""
        storage = _TrackingStorage()
        use_case = ResolveProtectedMediaUseCase(
            media_repo=_FakeMediaRepo(),
            media_storage=storage,
        )

        with self.assertRaises(ResourceNotFound):
            use_case.execute(
                ResolveProtectedMediaInput(path="/etc/passwd", user_id=1)
            )

        self.assertFalse(storage.exists_called)
        self.assertFalse(storage.open_called)

    def test_embedded_dotdot_raises_not_found_without_filesystem_access(self):
        """videos/../../../etc/passwd のようなパスも拒否する。"""
        storage = _TrackingStorage()
        use_case = ResolveProtectedMediaUseCase(
            media_repo=_FakeMediaRepo(),
            media_storage=storage,
        )

        with self.assertRaises(ResourceNotFound):
            use_case.execute(
                ResolveProtectedMediaInput(path="videos/../../../etc/passwd", user_id=1)
            )

        self.assertFalse(storage.exists_called)
        self.assertFalse(storage.open_called)
