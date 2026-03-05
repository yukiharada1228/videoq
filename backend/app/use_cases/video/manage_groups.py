"""
Use cases for managing video groups: membership, ordering, and share links.
"""

from typing import List, Optional, Tuple

from app.domain.video.repositories import VideoGroupRepository, VideoRepository
from app.domain.video.services import ShareLinkService
from app.use_cases.video.exceptions import ResourceNotFound


class AddVideoToGroupUseCase:
    """Add a single video to a group."""

    def __init__(
        self, video_repo: VideoRepository, group_repo: VideoGroupRepository
    ):
        self.video_repo = video_repo
        self.group_repo = group_repo

    def execute(self, group_id: int, video_id: int, user_id: int):
        """
        Returns:
            VideoGroupMemberEntity: The newly created membership record.

        Raises:
            ResourceNotFound: If the group or video is not found.
            ValueError: If the video is already in the group.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        return self.group_repo.add_video(group, video)


class AddVideosToGroupUseCase:
    """Bulk-add multiple videos to a group, skipping existing members."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(
        self, group_id: int, video_ids: List[int], user_id: int
    ) -> Tuple[int, int]:
        """
        Returns:
            (added_count, skipped_count)

        Raises:
            ResourceNotFound: If the group is not found or some videos are not found.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        try:
            return self.group_repo.add_videos_bulk(group, video_ids, user_id)
        except ValueError as e:
            raise ResourceNotFound("Some videos") from e


class RemoveVideoFromGroupUseCase:
    """Remove a video from a group."""

    def __init__(
        self, video_repo: VideoRepository, group_repo: VideoGroupRepository
    ):
        self.video_repo = video_repo
        self.group_repo = group_repo

    def execute(self, group_id: int, video_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the group or video is not found.
            ValueError: If the video is not in the group.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        self.group_repo.remove_video(group, video)


class ReorderVideosInGroupUseCase:
    """Reorder videos within a group."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, group_id: int, video_ids: List[int], user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the group is not found.
            ValueError: If video_ids don't match the group's members.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        self.group_repo.reorder_videos(group, video_ids)


class CreateShareLinkUseCase:
    """Generate a share link for a group."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, group_id: int, user_id: int) -> str:
        """
        Returns:
            str: The generated share token.

        Raises:
            ResourceNotFound: If the group is not found.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        share_token = ShareLinkService.generate_token()
        self.group_repo.update_share_token(group, share_token)
        return share_token


class DeleteShareLinkUseCase:
    """Disable the share link for a group."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, group_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the group is not found or has no active share link.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        if not group.share_token:
            raise ResourceNotFound("Share link")

        self.group_repo.update_share_token(group, None)
