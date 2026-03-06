"""
Use case: Retrieve a single video by ID for the owning user.
"""

from typing import Optional

from app.domain.video.ports import FileUrlResolver
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import VideoResponseDTO
from app.use_cases.video.file_url import to_video_response_dto


class GetVideoDetailUseCase:
    def __init__(
        self,
        video_repo: VideoRepository,
        file_url_resolver: Optional[FileUrlResolver] = None,
    ):
        self.video_repo = video_repo
        self.file_url_resolver = file_url_resolver

    def execute(self, video_id: int, user_id: int) -> Optional[VideoResponseDTO]:
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            return None
        return to_video_response_dto(video, self.file_url_resolver)
