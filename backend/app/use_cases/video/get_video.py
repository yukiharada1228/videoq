"""
Use case: Retrieve a single video by ID for the owning user.
"""

from typing import Optional

from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import VideoResponseDTO
from app.use_cases.video.file_url import to_video_response_dto


class GetVideoDetailUseCase:
    def __init__(
        self,
        video_repo: VideoRepository,
    ):
        self.video_repo = video_repo

    def execute(self, video_id: int, user_id: int) -> Optional[VideoResponseDTO]:
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            return None
        return to_video_response_dto(video)
