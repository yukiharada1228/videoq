"""
Django ORM implementations of video domain repository interfaces.
"""

import logging
from typing import List, Optional, Tuple

from django.db.models import Max, QuerySet

from app.domain.video.repositories import (
    TagRepository,
    VideoGroupRepository,
    VideoRepository,
)
from app.models import Tag, Video, VideoGroup, VideoGroupMember, VideoTag
from app.utils.query_optimizer import QueryOptimizer

logger = logging.getLogger(__name__)


class DjangoVideoRepository(VideoRepository):
    """Django ORM implementation of VideoRepository."""

    def get_by_id(self, video_id: int, user_id: int) -> Optional[Video]:
        return Video.objects.filter(id=video_id, user_id=user_id).first()

    def list_for_user(
        self,
        user_id: int,
        q: str = "",
        status: str = "",
        ordering: str = "",
        tag_ids: Optional[List[int]] = None,
        include_transcript: bool = False,
        include_groups: bool = False,
    ) -> QuerySet:
        from django.db.models import Q

        queryset = QueryOptimizer.get_videos_with_metadata(
            user_id=user_id,
            include_transcript=include_transcript,
            include_groups=include_groups,
        )

        if q:
            queryset = queryset.filter(
                Q(title__icontains=q) | Q(description__icontains=q)
            )

        if status:
            queryset = queryset.filter(status=status)

        if tag_ids:
            for tag_id in tag_ids:
                queryset = queryset.filter(tags__id=tag_id)

        ordering_map = {
            "uploaded_at_desc": "-uploaded_at",
            "uploaded_at_asc": "uploaded_at",
            "title_asc": "title",
            "title_desc": "-title",
        }
        if ordering in ordering_map:
            queryset = queryset.order_by(ordering_map[ordering])

        return queryset

    def create(self, user_id: int, validated_data: dict) -> Video:
        return Video.objects.create(user_id=user_id, **validated_data)

    def update(self, video: Video, validated_data: dict) -> Video:
        for field, value in validated_data.items():
            setattr(video, field, value)
        video.save(update_fields=list(validated_data.keys()))
        video.refresh_from_db()
        return video

    def delete(self, video: Video) -> None:
        video.delete()

    def count_for_user(self, user_id: int) -> int:
        return Video.objects.filter(user_id=user_id).count()


class DjangoVideoGroupRepository(VideoGroupRepository):
    """Django ORM implementation of VideoGroupRepository."""

    def get_by_id(
        self,
        group_id: int,
        user_id: int,
        include_videos: bool = False,
    ) -> Optional[VideoGroup]:
        queryset = VideoGroup.objects.filter(id=group_id, user_id=user_id)
        if include_videos:
            queryset = QueryOptimizer.optimize_video_group_queryset(
                queryset,
                include_videos=True,
                annotate_video_count=True,
            )
        return queryset.first()

    def list_for_user(
        self, user_id: int, annotate_only: bool = False
    ) -> QuerySet:
        return QueryOptimizer.get_video_groups_with_videos(
            user_id=user_id,
            include_videos=not annotate_only,
            annotate_video_count=True,
        )

    def create(self, user_id: int, validated_data: dict) -> VideoGroup:
        return VideoGroup.objects.create(user_id=user_id, **validated_data)

    def update(self, group: VideoGroup, validated_data: dict) -> VideoGroup:
        for field, value in validated_data.items():
            setattr(group, field, value)
        group.save(update_fields=list(validated_data.keys()))
        group.refresh_from_db()
        return group

    def delete(self, group: VideoGroup) -> None:
        group.delete()

    def get_by_share_token(self, share_token: str) -> Optional[VideoGroup]:
        queryset = VideoGroup.objects.filter(share_token=share_token)
        return QueryOptimizer.optimize_video_group_queryset(
            queryset,
            include_videos=True,
            include_user=True,
            annotate_video_count=True,
        ).first()

    def add_video(self, group: VideoGroup, video: Video) -> VideoGroupMember:
        if VideoGroupMember.objects.filter(group=group, video=video).exists():
            raise ValueError("This video is already added to the group")

        max_order = (
            VideoGroupMember.objects.filter(group=group)
            .aggregate(max_order=Max("order"))
            .get("max_order")
        )
        next_order = (max_order if max_order is not None else -1) + 1
        return VideoGroupMember.objects.create(
            group=group, video=video, order=next_order
        )

    def add_videos_bulk(
        self, group: VideoGroup, videos: List[Video], video_ids: List[int]
    ) -> Tuple[int, int]:
        existing_members = set(
            VideoGroupMember.objects.filter(
                group=group, video_id__in=[v.id for v in videos]
            ).values_list("video_id", flat=True)
        )

        video_map = {video.id: video for video in videos}
        videos_to_add = [
            video_map[vid]
            for vid in video_ids
            if vid in video_map and vid not in existing_members
        ]

        max_order = (
            VideoGroupMember.objects.filter(group=group)
            .aggregate(max_order=Max("order"))
            .get("max_order")
        )
        base_order = (max_order if max_order is not None else -1)

        members_to_create = [
            VideoGroupMember(group=group, video=video, order=base_order + idx)
            for idx, video in enumerate(videos_to_add, start=1)
        ]
        VideoGroupMember.objects.bulk_create(members_to_create)

        added_count = len(members_to_create)
        skipped_count = len(video_ids) - added_count
        return added_count, skipped_count

    def remove_video(self, group: VideoGroup, video: Video) -> None:
        member = VideoGroupMember.objects.filter(group=group, video=video).first()
        if not member:
            raise ValueError("This video is not added to the group")
        member.delete()

    def reorder_videos(self, group: VideoGroup, video_ids: List[int]) -> None:
        members = list(
            VideoGroupMember.objects.filter(group=group).select_related("video")
        )
        group_video_ids = {member.video_id for member in members}
        if set(video_ids) != group_video_ids:
            raise ValueError("Specified video IDs do not match videos in group")

        member_dict = {member.video_id: member for member in members}
        members_to_update = []
        for index, video_id in enumerate(video_ids):
            member = member_dict[video_id]
            member.order = index
            members_to_update.append(member)
        VideoGroupMember.objects.bulk_update(members_to_update, ["order"])

    def update_share_token(
        self, group: VideoGroup, token: Optional[str]
    ) -> None:
        group.share_token = token
        group.save(update_fields=["share_token"])


class DjangoTagRepository(TagRepository):
    """Django ORM implementation of TagRepository."""

    def list_for_user(self, user_id: int) -> QuerySet:
        from django.db.models import Count

        return Tag.objects.filter(user_id=user_id).annotate(
            video_count=Count("video_tags")
        )

    def get_by_id(self, tag_id: int, user_id: int) -> Optional[Tag]:
        return Tag.objects.filter(id=tag_id, user_id=user_id).first()

    def create(self, user_id: int, validated_data: dict) -> Tag:
        return Tag.objects.create(user_id=user_id, **validated_data)

    def update(self, tag: Tag, validated_data: dict) -> Tag:
        for field, value in validated_data.items():
            setattr(tag, field, value)
        tag.save(update_fields=list(validated_data.keys()))
        return tag

    def delete(self, tag: Tag) -> None:
        tag.delete()

    def add_tags_to_video(
        self, video: Video, tag_ids: List[int]
    ) -> Tuple[int, int]:
        tags = list(Tag.objects.filter(user_id=video.user_id, id__in=tag_ids))
        if len(tags) != len(tag_ids):
            raise ValueError("Some tags not found")

        existing_tags = set(
            VideoTag.objects.filter(
                video=video, tag_id__in=tag_ids
            ).values_list("tag_id", flat=True)
        )
        tags_to_add = [tag for tag in tags if tag.id not in existing_tags]
        VideoTag.objects.bulk_create(
            [VideoTag(video=video, tag=tag) for tag in tags_to_add]
        )
        added_count = len(tags_to_add)
        return added_count, len(tag_ids) - added_count

    def remove_tag_from_video(self, video: Video, tag: Tag) -> None:
        video_tag = VideoTag.objects.filter(video=video, tag=tag).first()
        if not video_tag:
            raise ValueError("This tag is not attached to the video")
        video_tag.delete()
