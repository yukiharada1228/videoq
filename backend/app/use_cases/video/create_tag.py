"""
Use case: Create a new tag.
"""

from app.domain.video.dto import CreateTagParams
from app.domain.video.exceptions import InvalidTagColor as DomainInvalidTagColor
from app.domain.video.exceptions import InvalidTagName as DomainInvalidTagName
from app.domain.video.repositories import TagRepository
from app.domain.video.services import TagPolicy
from app.use_cases.video.dto import CreateTagInput, TagResponseDTO
from app.use_cases.video.exceptions import InvalidTagInput
from app.use_cases.video.file_url import to_tag_response_dtos


class CreateTagUseCase:
    """Create a new tag for a user."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, user_id: int, input: CreateTagInput) -> TagResponseDTO:
        try:
            normalized_name = TagPolicy.normalize_name(input.name)
            validated_color = TagPolicy.validate_color(input.color)
        except (DomainInvalidTagName, DomainInvalidTagColor) as e:
            raise InvalidTagInput(str(e)) from e

        params = CreateTagParams(name=normalized_name, color=validated_color)
        created = self.tag_repo.create(user_id=user_id, params=params)
        return to_tag_response_dtos([created])[0]
