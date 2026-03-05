"""Helpers for resolving storage file keys to public file URLs in video use cases."""

from __future__ import annotations

from typing import Iterable, Optional

from app.domain.video.entities import TagEntity, VideoEntity, VideoGroupEntity
from app.domain.video.ports import FileUrlResolver


def resolve_video_file_urls(
    videos: Iterable[VideoEntity], file_url_resolver: Optional[FileUrlResolver]
) -> None:
    """Resolve and assign file_url for each video in-place."""
    for video in videos:
        if file_url_resolver and video.file_key:
            video.file_url = file_url_resolver.resolve(video.file_key)
        else:
            video.file_url = None


def resolve_group_video_file_urls(
    group: VideoGroupEntity, file_url_resolver: Optional[FileUrlResolver]
) -> None:
    """Resolve file_url for group.videos and member.video in-place."""
    resolve_video_file_urls(group.videos, file_url_resolver)
    member_videos = [member.video for member in group.members if member.video is not None]
    resolve_video_file_urls(member_videos, file_url_resolver)


def resolve_tag_video_file_urls(
    tag: TagEntity, file_url_resolver: Optional[FileUrlResolver]
) -> None:
    """Resolve file_url for tag.videos in-place."""
    resolve_video_file_urls(tag.videos, file_url_resolver)
