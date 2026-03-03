from django.db.models import Count, Prefetch, Q
from django.db.models.functions import TruncDate

from app.models import ChatLog, Video, VideoGroup, VideoGroupMember


def get_chat_logs_queryset(group, *, ascending=True):
    order_field = "created_at" if ascending else "-created_at"
    return group.chat_logs.select_related("user").order_by(order_field)


def get_video_group_with_members(group_id, *, user_id=None, share_token=None):
    queryset = VideoGroup.objects.select_related("user").prefetch_related(
        Prefetch(
            "members",
            queryset=VideoGroupMember.objects.select_related("video"),
        )
    )

    if share_token:
        return queryset.get(id=group_id, share_token=share_token)
    if user_id:
        return queryset.get(id=group_id, user_id=user_id)
    return queryset.get(id=group_id)


def create_chat_log(
    *,
    user,
    group,
    question,
    answer,
    related_videos,
    is_shared_origin,
):
    return ChatLog.objects.create(
        user=user,
        group=group,
        question=question,
        answer=answer,
        related_videos=related_videos,
        is_shared_origin=is_shared_origin,
    )


def get_chat_log_with_group(*, chat_log_id):
    return ChatLog.objects.select_related("group").filter(id=chat_log_id).first()


def save_chat_feedback(*, chat_log, feedback):
    chat_log.feedback = feedback
    chat_log.save(update_fields=["feedback"])
    return chat_log


def get_group_chat_log_values(group, *fields):
    return ChatLog.objects.filter(group=group).values(*fields)


def get_video_file_records(*, video_ids, owner_user):
    return Video.objects.filter(id__in=video_ids, user=owner_user)


def get_group_chat_logs(*, group):
    return ChatLog.objects.filter(group=group)


def get_group_chat_date_range(*, group):
    chat_logs_qs = get_group_chat_logs(group=group)
    total = chat_logs_qs.count()
    if total == 0:
        return 0, {}

    first_log = (
        chat_logs_qs.order_by("created_at").values_list("created_at", flat=True).first()
    )
    last_log = (
        chat_logs_qs.order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )
    return total, {
        "first": first_log.isoformat() if first_log else None,
        "last": last_log.isoformat() if last_log else None,
    }


def get_group_time_series(*, group):
    time_series = list(
        get_group_chat_logs(group=group)
        .annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(count=Count("id"))
        .order_by("date")
        .values("date", "count")
    )
    for entry in time_series:
        entry["date"] = entry["date"].isoformat()
    return time_series


def get_group_feedback_aggregate(*, group):
    return get_group_chat_logs(group=group).aggregate(
        good=Count("id", filter=Q(feedback="good")),
        bad=Count("id", filter=Q(feedback="bad")),
        none=Count("id", filter=Q(feedback__isnull=True)),
    )


def get_group_questions(*, group):
    return list(get_group_chat_logs(group=group).values_list("question", flat=True))
