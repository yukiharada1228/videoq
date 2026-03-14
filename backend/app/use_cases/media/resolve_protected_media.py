"""
Use case: resolve access to a protected media file.
"""

import mimetypes
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.domain.media.ports import MediaStorageGateway, ProtectedMediaRepository
from app.use_cases.shared.exceptions import ResourceNotFound


@dataclass(frozen=True)
class ResolveProtectedMediaInput:
    path: str
    user_id: Optional[int] = None
    group_id: Optional[int] = None


@dataclass(frozen=True)
class ResolveProtectedMediaOutput:
    path: str
    redirect_path: str
    content_type: Optional[str] = None


def _is_safe_path(path: str) -> bool:
    """絶対パスや .. を含むパスを拒否する。"""
    if os.path.isabs(path):
        return False
    if ".." in Path(path).parts:
        return False
    return True


class ResolveProtectedMediaUseCase:
    """
    Authorises access to a protected media file.

    Inputs:
        path     — storage-relative file path (e.g. "videos/abc.mp4")
        user_id  — set when the request is user-authenticated
        group_id — set when the request carries a share-token

    Raises ResourceNotFound for any denial (file missing, not in group,
    not owned by user) so the caller can map it uniformly to HTTP 404.

    Execution order (defense-in-depth):
        1. Path safety check — reject traversal before any I/O
        2. DB lookup — find the associated video
        3. Authorization — confirm ownership or group membership
        4. Storage existence check — confirm the file is present
    """

    def __init__(
        self,
        media_repo: ProtectedMediaRepository,
        media_storage: MediaStorageGateway,
    ):
        self.media_repo = media_repo
        self.media_storage = media_storage

    def execute(self, input: ResolveProtectedMediaInput) -> ResolveProtectedMediaOutput:
        # 1. パス検証 — ファイルシステムアクセスより前に実行する
        if not _is_safe_path(input.path):
            raise ResourceNotFound("Media")

        # 2. DB lookup
        video_id = self.media_repo.find_video_id_by_file_path(input.path)
        if video_id is None:
            raise ResourceNotFound("Media")

        # 3. 認可チェック
        if input.group_id is not None:
            if not self.media_repo.is_video_in_group(video_id, input.group_id):
                raise ResourceNotFound("Media")
        elif input.user_id is not None:
            if not self.media_repo.is_video_owned_by_user(video_id, input.user_id):
                raise ResourceNotFound("Media")
        else:
            raise ResourceNotFound("Media")

        # 4. ファイル存在確認 — 認可後に実行
        if not self.media_storage.exists(input.path):
            raise ResourceNotFound("Media")

        content_type, _ = mimetypes.guess_type(input.path)
        return ResolveProtectedMediaOutput(
            path=input.path,
            redirect_path=f"/api/protected_media/{input.path}",
            content_type=content_type,
        )
