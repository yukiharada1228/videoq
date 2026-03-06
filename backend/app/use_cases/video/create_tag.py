"""
Use case: Create a new tag.
"""

from app.domain.video.dto import CreateTagParams
from app.domain.video.repositories import TagRepository
from app.use_cases.video.dto import CreateTagInput, TagResponseDTO
from app.use_cases.video.file_url import to_tag_response_dtos


class CreateTagUseCase:
    """Create a new tag for a user."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, user_id: int, input: CreateTagInput) -> TagResponseDTO:
        params = CreateTagParams(name=input.name, color=input.color)
        created = self.tag_repo.create(user_id=user_id, params=params)
        return to_tag_response_dtos([created])[0]
