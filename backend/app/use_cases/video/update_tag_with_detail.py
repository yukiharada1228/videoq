"""
Use case: Update a tag and return detail DTO.
"""

from typing import Optional

from app.domain.video.dto import UpdateTagParams
from app.domain.video.ports import FileUrlResolver
from app.domain.video.repositories import TagRepository
from app.use_cases.video.dto import TagDetailResponseDTO, UpdateTagInput
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import to_tag_detail_response_dto


class UpdateTagWithDetailUseCase:
    """Update a tag and return its detail response."""

    def __init__(
        self,
        tag_repo: TagRepository,
        file_url_resolver: Optional[FileUrlResolver] = None,
    ):
        self.tag_repo = tag_repo
        self.file_url_resolver = file_url_resolver

    def execute(self, tag_id: int, user_id: int, input: UpdateTagInput) -> TagDetailResponseDTO:
        tag = self.tag_repo.get_by_id(tag_id=tag_id, user_id=user_id)
        if tag is None:
            raise ResourceNotFound("Tag")

        params = UpdateTagParams(name=input.name, color=input.color)
        self.tag_repo.update(tag=tag, params=params)

        detail = self.tag_repo.get_with_videos(tag_id=tag_id, user_id=user_id)
        if detail is None:
            raise ResourceNotFound("Tag")
        return to_tag_detail_response_dto(detail, self.file_url_resolver)
