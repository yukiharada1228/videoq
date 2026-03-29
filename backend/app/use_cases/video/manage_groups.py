"""
Use cases for managing video groups: membership, ordering, and share links.
"""

from typing import List, Tuple

from app.domain.video.exceptions import (
    GroupVideoOrderMismatch as DomainGroupVideoOrderMismatch,
    InvalidShareSlug as DomainInvalidShareSlug,
    ReservedShareSlug as DomainReservedShareSlug,
    ShareSlugAlreadyExists as DomainShareSlugAlreadyExists,
    ShareLinkNotActive as DomainShareLinkNotActive,
    SomeVideosNotFound as DomainSomeVideosNotFound,
    VideoAlreadyInGroup as DomainVideoAlreadyInGroup,
    VideoNotInGroup as DomainVideoNotInGroup,
)
from app.domain.video.repositories import VideoGroupRepository, VideoRepository
from app.domain.video.services import ShareSlugPolicy, VideoGroupMembershipService
from app.use_cases.video.dto import VideoGroupMemberResponseDTO
from app.use_cases.video.exceptions import (
    GroupVideoOrderMismatch,
    InvalidShareSlugInput,
    ResourceNotFound,
    ShareSlugAlreadyExists,
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
        group = self.group_repo.get_by_id(group_id, user_id, include_videos=True)
        if group is None:
            raise ResourceNotFound("Group")

        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        try:
            VideoGroupMembershipService.ensure_can_add_video(
                group=group,
                video_id=video.id,
            )
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

        existing_video_ids = self.video_repo.get_existing_ids_for_user(
            video_ids=list(dict.fromkeys(video_ids)),
            user_id=user_id,
        )
        try:
            ids_to_add, skipped_count = VideoGroupMembershipService.plan_bulk_add(
                group=group,
                requested_video_ids=video_ids,
                existing_video_ids=existing_video_ids,
            )
        except DomainSomeVideosNotFound as e:
            raise ResourceNotFound("Some videos") from e
        added_count, _ = self.group_repo.add_videos_bulk(group, ids_to_add, user_id)
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
        group = self.group_repo.get_by_id(group_id, user_id, include_videos=True)
        if group is None:
            raise ResourceNotFound("Group")

        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        try:
            VideoGroupMembershipService.ensure_contains_video(
                group=group,
                video_id=video.id,
            )
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

        try:
            VideoGroupMembershipService.ensure_reorder_matches_members(
                group=group,
                requested_video_ids=video_ids,
            )
        except DomainGroupVideoOrderMismatch:
            raise GroupVideoOrderMismatch()

        self.group_repo.reorder_videos(group, video_ids)


class CreateShareLinkUseCase:
    """Create or update a share slug for a group."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, group_id: int, user_id: int, share_slug: str) -> str:
        """
        Returns:
            str: The normalized share slug.

        Raises:
            ResourceNotFound: If the group is not found.
        """
        group = self.group_repo.get_by_id(group_id, user_id)
        if group is None:
            raise ResourceNotFound("Group")

        try:
            normalized_share_slug = ShareSlugPolicy.normalize(share_slug)
        except (DomainInvalidShareSlug, DomainReservedShareSlug) as e:
            raise InvalidShareSlugInput(str(e)) from e

        try:
            self.group_repo.update_share_slug(group, normalized_share_slug)
        except DomainShareSlugAlreadyExists as e:
            raise ShareSlugAlreadyExists() from e
        return normalized_share_slug


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

        try:
            group.assert_share_link_active()
        except DomainShareLinkNotActive:
            raise ResourceNotFound("Share link")

        self.group_repo.update_share_slug(group, None)
