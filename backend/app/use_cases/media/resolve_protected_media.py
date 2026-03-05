"""
Use case: resolve access to a protected media file.
"""

from dataclasses import dataclass
from typing import Optional

from app.domain.media.ports import ProtectedMediaRepository
from app.use_cases.shared.exceptions import ResourceNotFound


@dataclass(frozen=True)
class ResolveProtectedMediaInput:
    path: str
    user_id: Optional[int] = None
    group_id: Optional[int] = None


class ResolveProtectedMediaUseCase:
    """
    Authorises access to a protected media file.

    Inputs:
        path     — storage-relative file path (e.g. "videos/abc.mp4")
        user_id  — set when the request is user-authenticated
        group_id — set when the request carries a share-token

    Raises ResourceNotFound for any denial (file missing, not in group,
    not owned by user) so the caller can map it uniformly to HTTP 404.
    """

    def __init__(self, media_repo: ProtectedMediaRepository):
        self.media_repo = media_repo

    def execute(self, input: ResolveProtectedMediaInput) -> None:
        video_id = self.media_repo.find_video_id_by_file_path(input.path)
        if video_id is None:
            raise ResourceNotFound("Media")

        if input.group_id is not None:
            if not self.media_repo.is_video_in_group(video_id, input.group_id):
                raise ResourceNotFound("Media")
        elif input.user_id is not None:
            if not self.media_repo.is_video_owned_by_user(video_id, input.user_id):
                raise ResourceNotFound("Media")
        else:
            raise ResourceNotFound("Media")
