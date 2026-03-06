"""
Helpers for mapping domain entities to video use-case DTOs.
No in-place mutation of domain entities.
"""

from __future__ import annotations

from typing import Iterable, List

from app.domain.video.entities import TagEntity, VideoEntity, VideoGroupEntity, VideoGroupMemberEntity
from app.use_cases.video.dto import (
    TagDetailResponseDTO,
    TagResponseDTO,
    VideoGroupDetailResponseDTO,
    VideoGroupListResponseDTO,
    VideoGroupMemberResponseDTO,
    VideoResponseDTO,
)


def _to_tag_response_dto(tag: TagEntity) -> TagResponseDTO:
    return TagResponseDTO(
        id=tag.id,
        user_id=tag.user_id,
        name=tag.name,
        color=tag.color,
        video_count=tag.video_count,
        created_at=tag.created_at,
    )


def to_video_response_dto(
    video: VideoEntity,
) -> VideoResponseDTO:
    """Create a VideoResponseDTO from a VideoEntity."""
    return VideoResponseDTO(
        id=video.id,
        user_id=video.user_id,
        title=video.title,
        status=video.status,
        description=video.description,
        file_key=video.file_key,
        error_message=video.error_message,
        uploaded_at=video.uploaded_at,
        transcript=video.transcript,
        tags=[_to_tag_response_dto(tag) for tag in video.tags],
    )


def to_video_response_dtos(
    videos: Iterable[VideoEntity],
) -> List[VideoResponseDTO]:
    """Convert a sequence of VideoEntity to VideoResponseDTO list."""
    return [to_video_response_dto(v) for v in videos]


def to_tag_response_dtos(tags: Iterable[TagEntity]) -> List[TagResponseDTO]:
    """Convert a sequence of TagEntity to TagResponseDTO list."""
    return [_to_tag_response_dto(t) for t in tags]


def _member_to_response_dto(
    member: VideoGroupMemberEntity,
) -> VideoGroupMemberResponseDTO:
    video_dto = (
        to_video_response_dto(member.video)
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
    group: VideoGroupEntity,
) -> VideoGroupDetailResponseDTO:
    """Create a VideoGroupDetailResponseDTO from a VideoGroupEntity."""
    members = [_member_to_response_dto(m) for m in group.members]
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


def to_group_list_response_dtos(groups: Iterable[VideoGroupEntity]) -> List[VideoGroupListResponseDTO]:
    """Convert a sequence of VideoGroupEntity to list-friendly DTOs."""
    return [
        VideoGroupListResponseDTO(
            id=g.id,
            user_id=g.user_id,
            name=g.name,
            description=g.description,
            video_count=g.video_count,
            created_at=g.created_at,
        )
        for g in groups
    ]


def to_group_list_response_dto(group: VideoGroupEntity) -> VideoGroupListResponseDTO:
    """Convert a single VideoGroupEntity to VideoGroupListResponseDTO."""
    return to_group_list_response_dtos([group])[0]


def to_tag_detail_response_dto(
    tag: TagEntity,
) -> TagDetailResponseDTO:
    """Create a TagDetailResponseDTO from a TagEntity."""
    return TagDetailResponseDTO(
        id=tag.id,
        user_id=tag.user_id,
        name=tag.name,
        color=tag.color,
        video_count=tag.video_count,
        created_at=tag.created_at,
        videos=to_video_response_dtos(tag.videos),
    )
