"""
Use case: Delete a tag.
"""

from app.domain.video.repositories import TagRepository
from app.use_cases.video.exceptions import ResourceNotFound


class DeleteTagUseCase:
    """Delete a tag owned by a user."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, tag_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the tag does not exist.
        """
        tag = self.tag_repo.get_by_id(tag_id=tag_id, user_id=user_id)
        if tag is None:
            raise ResourceNotFound("Tag")
        self.tag_repo.delete(tag)
