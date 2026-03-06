"""
Django ORM implementations of chat domain repository interfaces.
"""

from typing import Dict, List, Optional, Sequence

from django.db.models import Count, Prefetch, Q
from django.db.models.functions import TruncDate

from app.domain.chat.dtos import RelatedVideoDTO
from app.domain.chat.entities import (
    ChatAnalyticsRaw,
    ChatLogEntity,
    VideoGroupContextEntity,
    VideoGroupMemberRef,
)
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.value_objects import ChatSceneLog, SceneReference
from app.models import ChatLog, VideoGroup, VideoGroupMember


# ---------------------------------------------------------------------------
# Entity mapper helpers
# ---------------------------------------------------------------------------


def _chat_log_to_entity(
    log: ChatLog, include_group_fields: bool = False
) -> ChatLogEntity:
    group_user_id = 0
    group_share_token = None
    if include_group_fields and hasattr(log, "group") and log.group_id:
        group_user_id = log.group.user_id
        group_share_token = log.group.share_token
    related_videos = [
        RelatedVideoDTO.from_dict(item) for item in (log.related_videos or [])
    ]
    return ChatLogEntity(
        id=log.id,
        user_id=log.user_id,
        group_id=log.group_id,
        group_user_id=group_user_id,
        group_share_token=group_share_token,
        question=log.question,
        answer=log.answer,
        related_videos=related_videos,
        is_shared_origin=log.is_shared_origin,
        feedback=log.feedback,
        created_at=log.created_at,
    )


def _group_to_context_entity(group: VideoGroup) -> VideoGroupContextEntity:
    members = [
        VideoGroupMemberRef(video_id=m.video_id) for m in group.members.all()
    ]
    return VideoGroupContextEntity(
        id=group.id,
        user_id=group.user_id,
        name=group.name,
        share_token=group.share_token,
        members=members,
    )


# ---------------------------------------------------------------------------
# DjangoChatRepository
# ---------------------------------------------------------------------------


class DjangoChatRepository(ChatRepository):
    """Django ORM implementation of ChatRepository."""

    def get_logs_for_group(
        self, group_id: int, ascending: bool = True
    ) -> List[ChatLogEntity]:
        order_field = "created_at" if ascending else "-created_at"
        logs = ChatLog.objects.filter(group_id=group_id).order_by(order_field)
        return [_chat_log_to_entity(log) for log in logs]

    def create_log(
        self,
        user_id: int,
        group_id: int,
        question: str,
        answer: str,
        related_videos: Optional[Sequence[RelatedVideoDTO]],
        is_shared: bool,
    ) -> ChatLogEntity:
        related_video_dicts = [dto.to_dict() for dto in (related_videos or [])]
        log = ChatLog.objects.create(
            user_id=user_id,
            group_id=group_id,
            question=question,
            answer=answer,
            related_videos=related_video_dicts,
            is_shared_origin=is_shared,
        )
        return _chat_log_to_entity(log)

    def get_log_by_id(self, log_id: int) -> Optional[ChatLogEntity]:
        log = (
            ChatLog.objects.select_related("group")
            .filter(id=log_id)
            .first()
        )
        if log is None:
            return None
        return _chat_log_to_entity(log, include_group_fields=True)

    def update_feedback(
        self, log: ChatLogEntity, feedback: Optional[str]
    ) -> ChatLogEntity:
        ChatLog.objects.filter(pk=log.id).update(feedback=feedback)
        updated = ChatLog.objects.select_related("group").get(pk=log.id)
        return _chat_log_to_entity(updated, include_group_fields=True)

    def get_logs_values_for_group(self, group_id: int) -> List[ChatSceneLog]:
        rows = ChatLog.objects.filter(group_id=group_id).values("question", "related_videos")
        result = []
        for row in rows:
            refs = [
                SceneReference(
                    video_id=rv.get("video_id"),
                    title=rv.get("title", ""),
                    start_time=rv.get("start_time"),
                    end_time=rv.get("end_time"),
                )
                for rv in (row["related_videos"] or [])
                if rv.get("video_id") and rv.get("start_time")
            ]
            result.append(ChatSceneLog(question=row["question"], related_videos=refs))
        return result

    def get_analytics_raw(self, group_id: int) -> ChatAnalyticsRaw:
        qs = ChatLog.objects.filter(group_id=group_id)
        total = qs.count()

        first_date = None
        last_date = None
        if total > 0:
            first_date = (
                qs.order_by("created_at")
                .values_list("created_at", flat=True)
                .first()
            )
            last_date = (
                qs.order_by("-created_at")
                .values_list("created_at", flat=True)
                .first()
            )

        raw_rows = list(qs.values("question", "related_videos"))
        logs_for_scenes = []
        for row in raw_rows:
            refs = [
                SceneReference(
                    video_id=rv.get("video_id"),
                    title=rv.get("title", ""),
                    start_time=rv.get("start_time"),
                    end_time=rv.get("end_time"),
                )
                for rv in (row["related_videos"] or [])
                if rv.get("video_id") and rv.get("start_time")
            ]
            logs_for_scenes.append(
                ChatSceneLog(question=row["question"], related_videos=refs)
            )

        time_series_qs = (
            qs.annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
            .values("date", "count")
        )
        time_series = []
        for entry in time_series_qs:
            time_series.append(
                {"date": entry["date"].isoformat(), "count": entry["count"]}
            )

        feedback = qs.aggregate(
            good=Count("id", filter=Q(feedback="good")),
            bad=Count("id", filter=Q(feedback="bad")),
            none=Count("id", filter=Q(feedback__isnull=True)),
        )

        questions = list(qs.values_list("question", flat=True))

        return ChatAnalyticsRaw(
            total=total,
            first_date=first_date,
            last_date=last_date,
            logs_for_scenes=logs_for_scenes,
            time_series=time_series,
            feedback=feedback,
            questions=questions,
        )


# ---------------------------------------------------------------------------
# DjangoVideoGroupQueryRepository
# ---------------------------------------------------------------------------


class DjangoVideoGroupQueryRepository(VideoGroupQueryRepository):
    """Django ORM implementation of VideoGroupQueryRepository."""

    def get_with_members(
        self,
        group_id: int,
        user_id: Optional[int] = None,
        share_token: Optional[str] = None,
    ) -> Optional[VideoGroupContextEntity]:
        queryset = VideoGroup.objects.select_related("user").prefetch_related(
            Prefetch(
                "members",
                queryset=VideoGroupMember.objects.select_related("video"),
            )
        )

        try:
            if share_token:
                group = queryset.get(id=group_id, share_token=share_token)
            elif user_id:
                group = queryset.get(id=group_id, user_id=user_id)
            else:
                group = queryset.get(id=group_id)
        except VideoGroup.DoesNotExist:
            return None

        return _group_to_context_entity(group)
