from django.db.models import Max

from app.models import Video, VideoGroupMember, VideoTag


def get_owned_resource(*, user, model_class, resource_id, select_related_fields=None):
    queryset = model_class.objects.filter(user=user, id=resource_id)
    if select_related_fields:
        queryset = queryset.select_related(*select_related_fields)
    return queryset.first()


def get_owned_resources(*, user, model_class, resource_ids):
    return list(model_class.objects.filter(user=user, id__in=resource_ids))


def count_user_videos(*, user) -> int:
    return Video.objects.filter(user=user).count()


def create_video(*, user, validated_data):
    return Video.objects.create(user=user, **validated_data)


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
    max_order = get_member_queryset(group=group).aggregate(max_order=Max("order")).get(
        "max_order"
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
    return list(
        VideoGroupMember.objects.filter(group=group).select_related("video")
    )


def bulk_update_group_members(*, members):
    VideoGroupMember.objects.bulk_update(members, ["order"])


def get_existing_video_tag_ids(*, video, tag_ids):
    return set(
        VideoTag.objects.filter(video=video, tag_id__in=tag_ids).values_list(
            "tag_id", flat=True
        )
    )


def bulk_create_video_tags(*, video_tags):
    VideoTag.objects.bulk_create(video_tags)


def save_group_share_token(*, group, token_value):
    group.share_token = token_value
    group.save(update_fields=["share_token"])
