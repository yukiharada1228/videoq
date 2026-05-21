"""
Use cases: Resolve a play URL (file_key) for a video.
Returns the raw file_key; URL signing is handled by the presentation layer.
"""

from typing import Optional

from app.domain.video.repositories import VideoGroupRepository, VideoRepository
from app.use_cases.video.exceptions import ResourceNotFound


class GetVideoPlayUrlUseCase:
    """Return the file_key for a video owned by the requesting user."""

    def __init__(self, video_repo: VideoRepository):
        self.video_repo = video_repo

    def execute(self, video_id: int, user_id: int) -> Optional[str]:
        """
        Returns:
            file_key (str | None) — None for YouTube-only videos.
        Raises:
            ResourceNotFound: If the video does not exist or is not owned by the user.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")
        return video.file_key


class GetSharedVideoPlayUrlUseCase:
    """Return the file_key for a video that belongs to a publicly shared group."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, share_slug: str, video_id: int) -> Optional[str]:
        """
        Returns:
            file_key (str | None) — None for YouTube-only videos.
        Raises:
            ResourceNotFound: If the share slug is invalid or the video is not in the group.
        """
        group = self.group_repo.get_by_share_slug(share_slug=share_slug)
        if group is None:
            raise ResourceNotFound("Group")
        member = next(
            (m for m in group.members if m.video_id == video_id and m.video is not None),
            None,
        )
        if member is None:
            raise ResourceNotFound("Video")
        return member.video.file_key
