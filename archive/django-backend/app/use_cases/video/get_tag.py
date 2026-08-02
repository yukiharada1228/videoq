"""
Use case: Get tag details with its associated videos.
"""

from app.domain.video.repositories import TagRepository
from app.use_cases.video.dto import TagDetailResponseDTO
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import to_tag_detail_response_dto


class GetTagDetailUseCase:
    """Retrieve a tag with its associated videos pre-loaded."""

    def __init__(
        self,
        tag_repo: TagRepository,
    ):
        self.tag_repo = tag_repo

    def execute(self, tag_id: int, user_id: int) -> TagDetailResponseDTO:
        """
        Raises:
            ResourceNotFound: If the tag does not exist.
        """
        tag = self.tag_repo.get_with_videos(tag_id=tag_id, user_id=user_id)
        if tag is None:
            raise ResourceNotFound("Tag")
        return to_tag_detail_response_dto(tag)
