"""
Use cases for managing tags on videos.
"""

from typing import List, Tuple

from app.domain.video.repositories import TagRepository, VideoRepository
from app.use_cases.video.exceptions import ResourceNotFound


class AddTagsToVideoUseCase:
    """Attach tags to a video, skipping already-attached ones."""

    def __init__(
        self, video_repo: VideoRepository, tag_repo: TagRepository
    ):
        self.video_repo = video_repo
        self.tag_repo = tag_repo

    def execute(
        self, video_id: int, tag_ids: List[int], user_id: int
    ) -> Tuple[int, int]:
        """
        Returns:
            (added_count, skipped_count)

        Raises:
            ResourceNotFound: If the video or some tags are not found.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        try:
            return self.tag_repo.add_tags_to_video(video, tag_ids)
        except ValueError as e:
            raise ResourceNotFound("Some tags") from e


class RemoveTagFromVideoUseCase:
    """Remove a tag from a video."""

    def __init__(
        self, video_repo: VideoRepository, tag_repo: TagRepository
    ):
        self.video_repo = video_repo
        self.tag_repo = tag_repo

    def execute(self, video_id: int, tag_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the video or tag is not found, or the tag is not attached.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        tag = self.tag_repo.get_by_id(tag_id, user_id)
        if tag is None:
            raise ResourceNotFound("Tag")

        try:
            self.tag_repo.remove_tag_from_video(video, tag)
        except ValueError as e:
            raise ResourceNotFound("Tag attachment") from e
