"""
Helpers for mapping VideoEntity → VideoResponseDTO with resolved file_url.
No in-place mutation of domain entities.
"""

from __future__ import annotations

from typing import Iterable, List, Optional

from app.domain.video.entities import TagEntity, VideoEntity, VideoGroupEntity, VideoGroupMemberEntity
from app.domain.video.ports import FileUrlResolver
from app.use_cases.video.dto import (
    TagDetailResponseDTO,
    VideoGroupDetailResponseDTO,
    VideoGroupMemberResponseDTO,
    VideoResponseDTO,
)


def _resolve_url(file_key: Optional[str], resolver: Optional[FileUrlResolver]) -> Optional[str]:
    if resolver and file_key:
        return resolver.resolve(file_key)
    return None


def to_video_response_dto(
    video: VideoEntity, file_url_resolver: Optional[FileUrlResolver]
) -> VideoResponseDTO:
    """Create a VideoResponseDTO from a VideoEntity with the resolved file_url."""
    return VideoResponseDTO(
        id=video.id,
        user_id=video.user_id,
        title=video.title,
        status=video.status,
        description=video.description,
        file_key=video.file_key,
        file_url=_resolve_url(video.file_key, file_url_resolver),
        error_message=video.error_message,
        uploaded_at=video.uploaded_at,
        transcript=video.transcript,
        tags=video.tags,
    )


def to_video_response_dtos(
    videos: Iterable[VideoEntity], file_url_resolver: Optional[FileUrlResolver]
) -> List[VideoResponseDTO]:
    """Convert a sequence of VideoEntity to VideoResponseDTO list."""
    return [to_video_response_dto(v, file_url_resolver) for v in videos]


def _member_to_response_dto(
    member: VideoGroupMemberEntity, file_url_resolver: Optional[FileUrlResolver]
) -> VideoGroupMemberResponseDTO:
    video_dto = (
        to_video_response_dto(member.video, file_url_resolver)
        if member.video is not None
        else None
    )
    return VideoGroupMemberResponseDTO(
        id=member.id,
        group_id=member.group_id,
        video_id=member.video_id,
        order=member.order,
        added_at=member.added_at,
        video=video_dto,
    )


def to_group_detail_response_dto(
    group: VideoGroupEntity, file_url_resolver: Optional[FileUrlResolver]
) -> VideoGroupDetailResponseDTO:
    """Create a VideoGroupDetailResponseDTO from a VideoGroupEntity with resolved file URLs."""
    members = [_member_to_response_dto(m, file_url_resolver) for m in group.members]
    return VideoGroupDetailResponseDTO(
        id=group.id,
        user_id=group.user_id,
        name=group.name,
        description=group.description,
        video_count=group.video_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
        share_token=group.share_token,
        members=members,
    )


def to_tag_detail_response_dto(
    tag: TagEntity, file_url_resolver: Optional[FileUrlResolver]
) -> TagDetailResponseDTO:
    """Create a TagDetailResponseDTO from a TagEntity with resolved file URLs."""
    return TagDetailResponseDTO(
        id=tag.id,
        user_id=tag.user_id,
        name=tag.name,
        color=tag.color,
        video_count=tag.video_count,
        created_at=tag.created_at,
        videos=to_video_response_dtos(tag.videos, file_url_resolver),
    )
