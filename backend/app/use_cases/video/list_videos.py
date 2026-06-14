"""
Use case: List videos for a user with optional filters.
"""

from typing import List

from app.domain.video.dto import VideoSearchCriteria
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import (
    ListVideosInput,
    VideoListPageResponseDTO,
    VideoResponseDTO,
)
from app.use_cases.video.file_url import to_video_response_dtos


class ListVideosUseCase:
    """Retrieve a filtered, ordered list of videos for a user."""

    def __init__(
        self,
        video_repo: VideoRepository,
    ):
        self.video_repo = video_repo

    def execute(
        self,
        user_id: int,
        input: ListVideosInput,
    ) -> List[VideoResponseDTO]:
        criteria = self._to_search_criteria(input)
        videos = self.video_repo.list_for_user(user_id=user_id, criteria=criteria)
        return to_video_response_dtos(videos)

    def execute_page(
        self,
        user_id: int,
        input: ListVideosInput,
        limit: int | None = None,
        offset: int = 0,
    ) -> VideoListPageResponseDTO:
        criteria = self._to_search_criteria(input)
        videos = self.video_repo.list_for_user(
            user_id=user_id,
            criteria=criteria,
            limit=limit,
            offset=offset,
        )
        return VideoListPageResponseDTO(
            count=self.video_repo.count_for_user(user_id=user_id, criteria=criteria),
            results=to_video_response_dtos(videos),
        )

    def _to_search_criteria(self, input: ListVideosInput) -> VideoSearchCriteria:
        return VideoSearchCriteria(
            keyword=input.keyword,
            status_filter=input.status_filter,
            sort_key=input.sort_key,
            tag_ids=input.tag_ids,
        )
