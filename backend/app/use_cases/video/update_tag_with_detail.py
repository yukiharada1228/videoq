"""
Use case: Update a tag and return detail DTO.
"""

from app.domain.video.dto import UpdateTagParams
from app.domain.video.exceptions import InvalidTagColor as DomainInvalidTagColor
from app.domain.video.exceptions import InvalidTagName as DomainInvalidTagName
from app.domain.video.repositories import TagRepository
from app.domain.video.services import TagPolicy
from app.use_cases.video.dto import TagDetailResponseDTO, UpdateTagInput
from app.use_cases.video.exceptions import InvalidTagInput, ResourceNotFound
from app.use_cases.video.file_url import to_tag_detail_response_dto


class UpdateTagWithDetailUseCase:
    """Update a tag and return its detail response."""

    def __init__(
        self,
        tag_repo: TagRepository,
    ):
        self.tag_repo = tag_repo

    def execute(self, tag_id: int, user_id: int, input: UpdateTagInput) -> TagDetailResponseDTO:
        tag = self.tag_repo.get_by_id(tag_id=tag_id, user_id=user_id)
        if tag is None:
            raise ResourceNotFound("Tag")

        try:
            normalized_name = TagPolicy.normalize_optional_name(input.name)
            validated_color = TagPolicy.validate_optional_color(input.color)
        except (DomainInvalidTagName, DomainInvalidTagColor) as e:
            raise InvalidTagInput(str(e)) from e

        params = UpdateTagParams(name=normalized_name, color=validated_color)
        self.tag_repo.update(tag=tag, params=params)

        detail = self.tag_repo.get_with_videos(tag_id=tag_id, user_id=user_id)
        if detail is None:
            raise ResourceNotFound("Tag")
        return to_tag_detail_response_dto(detail)
