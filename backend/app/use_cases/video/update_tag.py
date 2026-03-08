"""
Use case: Update a tag.
"""

from app.domain.video.dto import UpdateTagParams
from app.domain.video.exceptions import InvalidTagColor as DomainInvalidTagColor
from app.domain.video.exceptions import InvalidTagName as DomainInvalidTagName
from app.domain.video.repositories import TagRepository
from app.domain.video.services import TagPolicy
from app.use_cases.video.dto import TagResponseDTO, UpdateTagInput
from app.use_cases.video.exceptions import InvalidTagInput, ResourceNotFound
from app.use_cases.video.file_url import to_tag_response_dtos


class UpdateTagUseCase:
    """Update an existing tag."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, tag_id: int, user_id: int, input: UpdateTagInput) -> TagResponseDTO:
        """
        Raises:
            ResourceNotFound: If the tag does not exist.
        """
        tag = self.tag_repo.get_by_id(tag_id=tag_id, user_id=user_id)
        if tag is None:
            raise ResourceNotFound("Tag")
        try:
            normalized_name = TagPolicy.normalize_optional_name(input.name)
            validated_color = TagPolicy.validate_optional_color(input.color)
        except (DomainInvalidTagName, DomainInvalidTagColor) as e:
            raise InvalidTagInput(str(e)) from e

        params = UpdateTagParams(name=normalized_name, color=validated_color)
        updated = self.tag_repo.update(tag=tag, params=params)
        return to_tag_response_dtos([updated])[0]
