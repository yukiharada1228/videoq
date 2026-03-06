"""
Use cases for managing video groups: membership, ordering, and share links.
"""

from typing import List, Tuple

from app.domain.video.exceptions import (
    VideoAlreadyInGroup as DomainVideoAlreadyInGroup,
    VideoNotInGroup as DomainVideoNotInGroup,
)
from app.domain.video.repositories import VideoGroupRepository, VideoRepository
from app.domain.video.services import ShareLinkService
from app.use_cases.video.dto import VideoGroupMemberResponseDTO
from app.use_cases.video.exceptions import (
    GroupVideoOrderMismatch,
    ResourceNotFound,
    VideoAlreadyInGroup,
    VideoNotInGroup,
)


class AddVideoToGroupUseCase:
    """Add a single video to a group."""

    def __init__(
        self, video_repo: VideoRepository, group_repo: VideoGroupRepository
    ):
        self.video_repo = video_repo
        self.group_repo = group_repo

    def execute(
        self, group_id: int, video_id: int, user_id: int
    ) -> VideoGroupMemberResponseDTO:
        """
        Returns:
            VideoGroupMemberResponseDTO: The newly created membership record.

        Raises:
            ResourceNotFound: If the group or video is not found.
            VideoAlreadyInGroup: If the video is already in the group.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        try:
            member = self.group_repo.add_video(group, video)
            return VideoGroupMemberResponseDTO(
                id=member.id,
                group_id=member.group_id,
                video_id=member.video_id,
                order=member.order,
                added_at=member.added_at,
                video=None,
            )
        except DomainVideoAlreadyInGroup as e:
            raise VideoAlreadyInGroup(str(e)) from e


class AddVideosToGroupUseCase:
    """Bulk-add multiple videos to a group, skipping existing members."""

    def __init__(
        self, video_repo: VideoRepository, group_repo: VideoGroupRepository
    ):
        self.video_repo = video_repo
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
        group = self.group_repo.get_by_id(group_id, user_id, include_videos=True)
        if group is None:
            raise ResourceNotFound("Group")

        requested_ids = list(dict.fromkeys(video_ids))
        missing_ids = [
            video_id
            for video_id in requested_ids
            if self.video_repo.get_by_id(video_id, user_id) is None
        ]
        if missing_ids:
            raise ResourceNotFound("Some videos")

        existing_ids = {member.video_id for member in group.members}
        ids_to_add: List[int] = []
        seen_ids = set(existing_ids)
        for video_id in video_ids:
            if video_id in seen_ids:
                continue
            ids_to_add.append(video_id)
            seen_ids.add(video_id)

        added_count, _ = self.group_repo.add_videos_bulk(group, ids_to_add, user_id)
        skipped_count = len(video_ids) - len(ids_to_add)
        return added_count, skipped_count


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
            VideoNotInGroup: If the video is not in the group.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        try:
            self.group_repo.remove_video(group, video)
        except DomainVideoNotInGroup as e:
            raise VideoNotInGroup(str(e)) from e


class ReorderVideosInGroupUseCase:
    """Reorder videos within a group."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, group_id: int, video_ids: List[int], user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the group is not found.
            GroupVideoOrderMismatch: If video_ids don't match the group's members.
        """
        group = self.group_repo.get_by_id(group_id, user_id, include_videos=True)
        if group is None:
            raise ResourceNotFound("Group")

        group_video_ids = {member.video_id for member in group.members}
        if set(video_ids) != group_video_ids:
            raise GroupVideoOrderMismatch()

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
