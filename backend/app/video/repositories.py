from django.db.models import Max, Q

from app.models import Tag, Video, VideoGroup, VideoGroupMember, VideoTag
from app.utils.query_optimizer import QueryOptimizer


def get_owned_resource(*, user, model_class, resource_id, select_related_fields=None):
    queryset = model_class.objects.filter(user=user, id=resource_id)
    if select_related_fields:
        queryset = queryset.select_related(*select_related_fields)
    return queryset.first()


def get_owned_resources(*, user, model_class, resource_ids):
    return list(model_class.objects.filter(user=user, id__in=resource_ids))


def get_owned_video(*, user, video_id):
    return Video.objects.filter(user=user, id=video_id).first()


def get_owned_videos(*, user, video_ids):
    return list(Video.objects.filter(user=user, id__in=video_ids))


def get_owned_group(*, user, group_id):
    return VideoGroup.objects.filter(user=user, id=group_id).first()


def get_owned_tag(*, user, tag_id):
    return Tag.objects.filter(user=user, id=tag_id).first()


def get_owned_tags(*, user, tag_ids):
    return list(Tag.objects.filter(user=user, id__in=tag_ids))


def count_user_videos(*, user) -> int:
    return Video.objects.filter(user=user).count()


def create_video(*, user, validated_data):
    return Video.objects.create(user=user, **validated_data)


def update_video(*, video, validated_data):
    for key, value in validated_data.items():
        setattr(video, key, value)
    video.save(update_fields=list(validated_data.keys()))
    return video


def delete_video(*, video):
    file_ref = video.file
    video.delete()
    return file_ref


def create_group(*, user, validated_data):
    return VideoGroup.objects.create(user=user, **validated_data)


def update_group(*, group, validated_data):
    for key, value in validated_data.items():
        setattr(group, key, value)
    group.save(update_fields=list(validated_data.keys()))
    return group


def delete_group(*, group):
    group.delete()


def create_tag(*, user, validated_data):
    return Tag.objects.create(user=user, **validated_data)


def update_tag(*, tag, validated_data):
    for key, value in validated_data.items():
        setattr(tag, key, value)
    tag.save(update_fields=list(validated_data.keys()))
    return tag


def delete_tag(*, tag):
    tag.delete()


def get_member_queryset(*, group, video=None, select_related=False):
    queryset = VideoGroupMember.objects.filter(group=group)
    if video:
        queryset = queryset.filter(video=video)
    if select_related:
        queryset = queryset.select_related("video", "group")
    return queryset


def get_member(*, group, video):
    return get_member_queryset(group=group, video=video).first()


def get_next_group_order(*, group):
    max_order = (
        get_member_queryset(group=group)
        .aggregate(max_order=Max("order"))
        .get("max_order")
    )
    return (max_order if max_order is not None else -1) + 1


def create_group_member(*, group, video, order):
    return VideoGroupMember.objects.create(group=group, video=video, order=order)


def get_existing_member_video_ids(*, group, video_ids):
    return set(
        get_member_queryset(group=group)
        .filter(video_id__in=video_ids)
        .values_list("video_id", flat=True)
    )


def bulk_create_group_members(*, members):
    VideoGroupMember.objects.bulk_create(members)


def get_members_for_reorder(*, group):
    return list(VideoGroupMember.objects.filter(group=group).select_related("video"))


def bulk_update_group_members(*, members):
    VideoGroupMember.objects.bulk_update(members, ["order"])


def remove_member(*, group, video):
    member = get_member(group=group, video=video)
    if not member:
        raise LookupError("This video is not added to the group")
    member.delete()


def get_existing_video_tag_ids(*, video, tag_ids):
    return set(
        VideoTag.objects.filter(video=video, tag_id__in=tag_ids).values_list(
            "tag_id", flat=True
        )
    )


def bulk_create_video_tags(*, video_tags):
    VideoTag.objects.bulk_create(video_tags)


def remove_video_tag(*, video, tag):
    video_tag = VideoTag.objects.filter(video=video, tag=tag).first()
    if not video_tag:
        raise LookupError("This tag is not attached to the video")
    video_tag.delete()


def save_group_share_token(*, group, token_value):
    group.share_token = token_value
    group.save(update_fields=["share_token"])


def get_shared_group(*, share_token):
    from app.utils.query_optimizer import QueryOptimizer

    queryset = VideoGroup.objects.filter(share_token=share_token)
    group = QueryOptimizer.optimize_video_group_queryset(
        queryset,
        include_videos=True,
        include_user=True,
        annotate_video_count=True,
    ).first()
    if not group:
        raise LookupError("Share link not found")
    return group


# ── List / Query Functions ──

_ORDERING_MAP = {
    "uploaded_at_desc": "-uploaded_at",
    "uploaded_at_asc": "uploaded_at",
    "title_asc": "title",
    "title_desc": "-title",
}


def get_filtered_videos(
    *,
    user_id: int,
    include_transcript: bool = False,
    include_groups: bool = False,
    q: str = "",
    status: str = "",
    tag_ids: list[int] | None = None,
    ordering: str = "",
):
    """Return an optimised, filtered queryset of videos for a user."""
    queryset = QueryOptimizer.get_videos_with_metadata(
        user_id=user_id,
        include_transcript=include_transcript,
        include_groups=include_groups,
    )

    if q:
        queryset = queryset.filter(Q(title__icontains=q) | Q(description__icontains=q))

    if status:
        queryset = queryset.filter(status=status)

    if tag_ids:
        for tag_id in tag_ids:
            queryset = queryset.filter(tags__id=tag_id)

    if ordering in _ORDERING_MAP:
        queryset = queryset.order_by(_ORDERING_MAP[ordering])

    return queryset


def get_video_groups_for_user(
    *,
    user_id: int,
    include_videos: bool = True,
    annotate_video_count: bool = True,
):
    """Return an optimised queryset of video groups for a user."""
    return QueryOptimizer.get_video_groups_with_videos(
        user_id=user_id,
        include_videos=include_videos,
        annotate_video_count=annotate_video_count,
    )
