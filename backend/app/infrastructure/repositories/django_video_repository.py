"""
Django ORM implementations of video domain repository interfaces.
"""

import logging
from typing import Dict, List, Optional, Tuple

from django.db import transaction
from django.db.models import Count, Max, Prefetch

from app.domain.video.dto import (
    CreateGroupParams,
    CreateTagParams,
    CreateVideoParams,
    UpdateGroupParams,
    UpdateTagParams,
    UpdateVideoParams,
    VideoSearchCriteria,
)
from app.domain.video.entities import (
    TagEntity,
    VideoEntity,
    VideoGroupEntity,
    VideoGroupMemberEntity,
)
from app.domain.video.exceptions import (
    GroupVideoOrderMismatch,
    InvalidVideoStatusTransition,
    SomeTagsNotFound,
    SomeVideosNotFound,
    TagNotAttachedToVideo,
    VideoAlreadyInGroup,
    VideoNotInGroup,
)
from app.domain.video.repositories import (
    TagRepository,
    VideoGroupRepository,
    VideoRepository,
)
from app.domain.video.status import VideoStatus
from app.infrastructure.models import Tag, Video, VideoGroup, VideoGroupMember, VideoTag
from app.infrastructure.common.query_optimizer import QueryOptimizer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Entity mapper helpers
# ---------------------------------------------------------------------------


def _tag_to_entity(tag: Tag, video_count: int = 0) -> TagEntity:
    return TagEntity(
        id=tag.id,
        user_id=tag.user_id,
        name=tag.name,
        color=tag.color,
        video_count=video_count,
        created_at=getattr(tag, "created_at", None),
    )


def _video_to_entity(video: Video) -> VideoEntity:
    file_key: Optional[str] = video.file.name if video.file else None

    tags = [
        _tag_to_entity(vt.tag) for vt in video.video_tags.all() if vt.tag_id
    ]

    return VideoEntity(
        id=video.id,
        user_id=video.user_id,
        title=video.title,
        status=video.status,
        description=video.description,
        file_key=file_key,
        error_message=video.error_message or None,
        uploaded_at=video.uploaded_at,
        transcript=video.transcript or None,
        tags=tags,
    )


def _member_to_entity(
    member: VideoGroupMember, include_video: bool = False
) -> VideoGroupMemberEntity:
    video_entity = None
    if include_video and hasattr(member, "video") and member.video_id:
        video_entity = _video_to_entity(member.video)
    return VideoGroupMemberEntity(
        id=member.id,
        group_id=member.group_id,
        video_id=member.video_id,
        order=member.order,
        added_at=getattr(member, "added_at", None),
        video=video_entity,
    )


def _group_to_entity(
    group: VideoGroup, include_videos: bool = False
) -> VideoGroupEntity:
    video_count = getattr(group, "video_count", 0)
    members: List[VideoGroupMemberEntity] = []
    videos: List[VideoEntity] = []
    if include_videos and hasattr(group, "_prefetched_objects_cache"):
        for member in group.members.all():
            member_entity = _member_to_entity(member, include_video=True)
            members.append(member_entity)
            if member_entity.video is not None:
                videos.append(member_entity.video)
    return VideoGroupEntity(
        id=group.id,
        user_id=group.user_id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        updated_at=group.updated_at,
        share_token=group.share_token,
        video_count=video_count,
        videos=videos,
        members=members,
    )


# ---------------------------------------------------------------------------
# DjangoVideoRepository
# ---------------------------------------------------------------------------


class DjangoVideoRepository(VideoRepository):
    """Django ORM implementation of VideoRepository."""

    def get_by_id(self, video_id: int, user_id: int) -> Optional[VideoEntity]:
        video = (
            Video.objects.filter(id=video_id, user_id=user_id)
            .prefetch_related(
                Prefetch("video_tags", queryset=VideoTag.objects.select_related("tag"))
            )
            .first()
        )
        if video is None:
            return None
        return _video_to_entity(video)

    def list_for_user(
        self,
        user_id: int,
        criteria: Optional[VideoSearchCriteria] = None,
    ) -> List[VideoEntity]:
        from django.db.models import Q

        search = criteria or VideoSearchCriteria()

        queryset = QueryOptimizer.get_videos_with_metadata(user_id=user_id)

        if search.keyword:
            queryset = queryset.filter(
                Q(title__icontains=search.keyword) | Q(description__icontains=search.keyword)
            )

        if search.status_filter:
            queryset = queryset.filter(status=search.status_filter)

        if search.tag_ids:
            for tag_id in search.tag_ids:
                queryset = queryset.filter(tags__id=tag_id)

        ordering_map = {
            "uploaded_at_desc": "-uploaded_at",
            "uploaded_at_asc": "uploaded_at",
            "title_asc": "title",
            "title_desc": "-title",
        }
        if search.sort_key in ordering_map:
            queryset = queryset.order_by(ordering_map[search.sort_key])

        return [_video_to_entity(v) for v in queryset]

    def create(self, user_id: int, params: CreateVideoParams) -> VideoEntity:
        video = Video.objects.create(
            user_id=user_id,
            file=params.upload_file,
            title=params.title,
            description=params.description,
        )
        # Re-fetch with prefetch to populate tags (will be empty on creation)
        video = (
            Video.objects.filter(pk=video.pk)
            .prefetch_related(
                Prefetch("video_tags", queryset=VideoTag.objects.select_related("tag"))
            )
            .get()
        )
        return _video_to_entity(video)

    def update(self, video: VideoEntity, params: UpdateVideoParams) -> VideoEntity:
        orm_video = Video.objects.get(pk=video.id)
        update_fields = []
        if params.title is not None:
            orm_video.title = params.title
            update_fields.append("title")
        if params.description is not None:
            orm_video.description = params.description
            update_fields.append("description")
        if update_fields:
            orm_video.save(update_fields=update_fields)
        # Re-fetch with prefetches
        orm_video = (
            Video.objects.filter(pk=video.id)
            .prefetch_related(
                Prefetch("video_tags", queryset=VideoTag.objects.select_related("tag"))
            )
            .get()
        )
        return _video_to_entity(orm_video)

    def delete(self, video: VideoEntity) -> None:
        try:
            orm_video = Video.objects.get(pk=video.id)
        except Video.DoesNotExist:
            return
        file_ref = orm_video.file if orm_video.file else None
        orm_video.delete()
        if file_ref:
            transaction.on_commit(lambda: file_ref.delete(save=False))

    def count_for_user(self, user_id: int) -> int:
        return Video.objects.filter(user_id=user_id).count()

    def get_file_keys_for_ids(
        self, video_ids: List[int], user_id: int
    ) -> Dict[int, Optional[str]]:
        videos = Video.objects.filter(id__in=video_ids, user_id=user_id).only(
            "id", "file"
        )
        return {v.id: (v.file.name if v.file else None) for v in videos}

    def list_completed_with_transcript(self) -> List[VideoEntity]:
        videos = (
            Video.objects.filter(status="completed")
            .exclude(transcript__isnull=True)
            .exclude(transcript="")
            .select_related("user")
            .prefetch_related(
                Prefetch("video_tags", queryset=VideoTag.objects.select_related("tag"))
            )
        )
        return [_video_to_entity(v) for v in videos]

    def get_by_id_for_task(self, video_id: int) -> Optional[VideoEntity]:
        video = (
            Video.objects.filter(id=video_id)
            .select_related("user")
            .prefetch_related(
                Prefetch("video_tags", queryset=VideoTag.objects.select_related("tag"))
            )
            .first()
        )
        if video is None:
            return None
        return _video_to_entity(video)

    def transition_status(
        self,
        video_id: int,
        from_status: VideoStatus,
        to_status: VideoStatus,
        error_message: str = "",
    ) -> None:
        updated = Video.objects.filter(id=video_id, status=from_status.value).update(
            status=to_status.value,
            error_message=error_message,
        )
        if updated == 0:
            raise InvalidVideoStatusTransition(from_status.value, to_status.value)

    def save_transcript(self, video_id: int, transcript: str) -> None:
        Video.objects.filter(id=video_id).update(transcript=transcript)


# ---------------------------------------------------------------------------
# DjangoVideoGroupRepository
# ---------------------------------------------------------------------------


class DjangoVideoGroupRepository(VideoGroupRepository):
    """Django ORM implementation of VideoGroupRepository."""

    def get_by_id(
        self,
        group_id: int,
        user_id: int,
        include_videos: bool = False,
    ) -> Optional[VideoGroupEntity]:
        queryset = VideoGroup.objects.filter(id=group_id, user_id=user_id)
        if include_videos:
            queryset = QueryOptimizer.optimize_video_group_queryset(
                queryset,
                include_videos=True,
                annotate_video_count=True,
            )
        else:
            queryset = queryset.annotate(video_count=Count("members__video", distinct=True))
        group = queryset.first()
        if group is None:
            return None
        return _group_to_entity(group, include_videos=include_videos)

    def list_for_user(
        self, user_id: int, include_videos: bool = False
    ) -> List[VideoGroupEntity]:
        queryset = QueryOptimizer.get_video_groups_with_videos(
            user_id=user_id,
            include_videos=include_videos,
            annotate_video_count=True,
        )
        return [_group_to_entity(g, include_videos=include_videos) for g in queryset]

    def create(self, user_id: int, params: CreateGroupParams) -> VideoGroupEntity:
        group = VideoGroup.objects.create(
            user_id=user_id,
            name=params.name,
            description=params.description,
        )
        group = VideoGroup.objects.annotate(
            video_count=Count("members__video", distinct=True)
        ).get(pk=group.pk)
        return _group_to_entity(group)

    def update(self, group: VideoGroupEntity, params: UpdateGroupParams) -> VideoGroupEntity:
        orm_group = VideoGroup.objects.get(pk=group.id)
        update_fields = []
        if params.name is not None:
            orm_group.name = params.name
            update_fields.append("name")
        if params.description is not None:
            orm_group.description = params.description
            update_fields.append("description")
        if update_fields:
            orm_group.save(update_fields=update_fields)
        orm_group = VideoGroup.objects.annotate(
            video_count=Count("members__video", distinct=True)
        ).get(pk=group.id)
        return _group_to_entity(orm_group)

    def delete(self, group: VideoGroupEntity) -> None:
        VideoGroup.objects.filter(pk=group.id).delete()

    def get_by_share_token(self, share_token: str) -> Optional[VideoGroupEntity]:
        queryset = VideoGroup.objects.filter(share_token=share_token)
        group = QueryOptimizer.optimize_video_group_queryset(
            queryset,
            include_videos=True,
            include_user=True,
            annotate_video_count=True,
        ).first()
        if group is None:
            return None
        return _group_to_entity(group, include_videos=True)

    def add_video(
        self, group: VideoGroupEntity, video: VideoEntity
    ) -> VideoGroupMemberEntity:
        if VideoGroupMember.objects.filter(
            group_id=group.id, video_id=video.id
        ).exists():
            raise VideoAlreadyInGroup()

        max_order = (
            VideoGroupMember.objects.filter(group_id=group.id)
            .aggregate(max_order=Max("order"))
            .get("max_order")
        )
        next_order = (max_order if max_order is not None else -1) + 1
        member = VideoGroupMember.objects.create(
            group_id=group.id, video_id=video.id, order=next_order
        )
        return _member_to_entity(member)

    def add_videos_bulk(
        self, group: VideoGroupEntity, video_ids: List[int], user_id: int
    ) -> Tuple[int, int]:
        videos = list(Video.objects.filter(id__in=video_ids, user_id=user_id))
        found_ids = {v.id for v in videos}
        if any(video_id not in found_ids for video_id in video_ids):
            raise SomeVideosNotFound()

        existing_members = set(
            VideoGroupMember.objects.filter(
                group_id=group.id, video_id__in=[v.id for v in videos]
            ).values_list("video_id", flat=True)
        )

        video_map = {v.id: v for v in videos}
        videos_to_add = [
            video_map[vid]
            for vid in video_ids
            if vid in video_map and vid not in existing_members
        ]

        max_order = (
            VideoGroupMember.objects.filter(group_id=group.id)
            .aggregate(max_order=Max("order"))
            .get("max_order")
        )
        base_order = max_order if max_order is not None else -1

        members_to_create = [
            VideoGroupMember(group_id=group.id, video=video, order=base_order + idx)
            for idx, video in enumerate(videos_to_add, start=1)
        ]
        VideoGroupMember.objects.bulk_create(members_to_create)

        added_count = len(members_to_create)
        skipped_count = len(video_ids) - added_count
        return added_count, skipped_count

    def remove_video(self, group: VideoGroupEntity, video: VideoEntity) -> None:
        member = VideoGroupMember.objects.filter(
            group_id=group.id, video_id=video.id
        ).first()
        if not member:
            raise VideoNotInGroup()
        member.delete()

    def reorder_videos(self, group: VideoGroupEntity, video_ids: List[int]) -> None:
        members = list(VideoGroupMember.objects.filter(group_id=group.id))
        group_video_ids = {member.video_id for member in members}
        if set(video_ids) != group_video_ids:
            raise GroupVideoOrderMismatch()

        member_dict = {member.video_id: member for member in members}
        members_to_update = []
        for index, video_id in enumerate(video_ids):
            member = member_dict[video_id]
            member.order = index
            members_to_update.append(member)
        VideoGroupMember.objects.bulk_update(members_to_update, ["order"])

    def update_share_token(
        self, group: VideoGroupEntity, token: Optional[str]
    ) -> None:
        VideoGroup.objects.filter(pk=group.id).update(share_token=token)


# ---------------------------------------------------------------------------
# DjangoTagRepository
# ---------------------------------------------------------------------------


class DjangoTagRepository(TagRepository):
    """Django ORM implementation of TagRepository."""

    def list_for_user(self, user_id: int) -> List[TagEntity]:
        tags = Tag.objects.filter(user_id=user_id).annotate(
            video_count=Count("video_tags")
        )
        return [_tag_to_entity(t, video_count=t.video_count) for t in tags]

    def get_by_id(self, tag_id: int, user_id: int) -> Optional[TagEntity]:
        tag = (
            Tag.objects.filter(id=tag_id, user_id=user_id)
            .annotate(video_count=Count("video_tags"))
            .first()
        )
        if tag is None:
            return None
        return _tag_to_entity(tag, video_count=tag.video_count)

    def create(self, user_id: int, params: CreateTagParams) -> TagEntity:
        tag = Tag.objects.create(user_id=user_id, name=params.name, color=params.color)
        return _tag_to_entity(tag, video_count=0)

    def update(self, tag: TagEntity, params: UpdateTagParams) -> TagEntity:
        orm_tag = Tag.objects.get(pk=tag.id)
        update_fields = []
        if params.name is not None:
            orm_tag.name = params.name
            update_fields.append("name")
        if params.color is not None:
            orm_tag.color = params.color
            update_fields.append("color")
        if update_fields:
            orm_tag.save(update_fields=update_fields)
        orm_tag = (
            Tag.objects.filter(pk=tag.id)
            .annotate(video_count=Count("video_tags"))
            .get()
        )
        return _tag_to_entity(orm_tag, video_count=orm_tag.video_count)

    def delete(self, tag: TagEntity) -> None:
        Tag.objects.filter(pk=tag.id).delete()

    def add_tags_to_video(
        self, video: VideoEntity, tag_ids: List[int]
    ) -> Tuple[int, int]:
        tags = list(Tag.objects.filter(user_id=video.user_id, id__in=tag_ids))
        if len(tags) != len(tag_ids):
            raise SomeTagsNotFound()

        existing_tags = set(
            VideoTag.objects.filter(
                video_id=video.id, tag_id__in=tag_ids
            ).values_list("tag_id", flat=True)
        )
        tags_to_add = [t for t in tags if t.id not in existing_tags]
        VideoTag.objects.bulk_create(
            [VideoTag(video_id=video.id, tag=t) for t in tags_to_add]
        )
        added_count = len(tags_to_add)
        return added_count, len(tag_ids) - added_count

    def remove_tag_from_video(self, video: VideoEntity, tag: TagEntity) -> None:
        video_tag = VideoTag.objects.filter(
            video_id=video.id, tag_id=tag.id
        ).first()
        if not video_tag:
            raise TagNotAttachedToVideo()
        video_tag.delete()

    def get_with_videos(self, tag_id: int, user_id: int) -> Optional[TagEntity]:
        try:
            tag = (
                Tag.objects.filter(id=tag_id, user_id=user_id)
                .annotate(video_count=Count("video_tags"))
                .prefetch_related(
                    Prefetch(
                        "video_tags",
                        queryset=VideoTag.objects.select_related("video").prefetch_related(
                            Prefetch(
                                "video__video_tags",
                                queryset=VideoTag.objects.select_related("tag"),
                            )
                        ),
                    )
                )
                .get()
            )
        except Tag.DoesNotExist:
            return None

        entity = _tag_to_entity(tag, video_count=tag.video_count)
        entity.videos = [_video_to_entity(vt.video) for vt in tag.video_tags.all()]
        return entity
