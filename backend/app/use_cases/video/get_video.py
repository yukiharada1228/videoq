"""
Use case: Retrieve a single video by ID for the owning user.
"""

from typing import Optional

from app.domain.video.repositories import VideoRepository
from app.domain.video.entities import VideoEntity


class GetVideoDetailUseCase:
    def __init__(self, video_repo: VideoRepository):
        self.video_repo = video_repo

    def execute(self, video_id: int, user_id: int) -> Optional[VideoEntity]:
        return self.video_repo.get_by_id(video_id, user_id)
