"""
Use case: Update a tag.
"""

from app.domain.video.dto import UpdateTagParams
from app.domain.video.repositories import TagRepository
from app.use_cases.video.dto import TagResponseDTO, UpdateTagInput
from app.use_cases.video.exceptions import ResourceNotFound
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
        params = UpdateTagParams(name=input.name, color=input.color)
        updated = self.tag_repo.update(tag=tag, params=params)
        return to_tag_response_dtos([updated])[0]
