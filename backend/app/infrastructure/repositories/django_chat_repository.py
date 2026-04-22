"""
Django ORM implementations of chat domain repository interfaces.
"""

from typing import List, Optional, Sequence

from django.db.models import Count, Prefetch, Q
from django.db.models.functions import TruncDate

from app.domain.chat.dtos import CitationDTO
from app.domain.chat.entities import (
    ChatAnalyticsRaw,
    ChatLogEntity,
    VideoGroupContextEntity,
    VideoGroupMemberRef,
)
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.value_objects import (
    ChatSceneLog,
    FeedbackSummary,
    SceneReference,
    TimeSeriesPoint,
)
from app.infrastructure.models import ChatLog, VideoGroup, VideoGroupMember


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
        group_share_token = log.group.share_slug
    citations = [
        CitationDTO(
            video_id=int(item.get("video_id", 0) or 0),
            title=str(item.get("title", "")),
            start_time=item.get("start_time"),
            end_time=item.get("end_time"),
        )
        for item in (log.citations or [])
    ]
    return ChatLogEntity(
        id=log.id,
        user_id=log.user_id,
        group_id=log.group_id,
        group_user_id=group_user_id,
        group_share_token=group_share_token,
        question=log.question,
        answer=log.answer,
        citations=citations,
        retrieved_contexts=list(log.retrieved_contexts or []),
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
        description=group.description,
        share_token=group.share_slug,
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
        citations: Optional[Sequence[CitationDTO]],
        is_shared: bool,
        retrieved_contexts: Optional[List[str]] = None,
    ) -> ChatLogEntity:
        citation_dicts = [
            {
                "video_id": dto.video_id,
                "title": dto.title,
                "start_time": dto.start_time,
                "end_time": dto.end_time,
            }
            for dto in (citations or [])
        ]
        log = ChatLog.objects.create(
            user_id=user_id,
            group_id=group_id,
            question=question,
            answer=answer,
            citations=citation_dicts,
            retrieved_contexts=retrieved_contexts or [],
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
        rows = ChatLog.objects.filter(group_id=group_id).values("question", "citations")
        result = []
        for row in rows:
            refs = [
                SceneReference(
                    video_id=rv.get("video_id"),
                    title=rv.get("title", ""),
                    start_time=rv.get("start_time"),
                    end_time=rv.get("end_time"),
                )
                for rv in (row["citations"] or [])
                if rv.get("video_id") and rv.get("start_time")
            ]
            result.append(ChatSceneLog(question=row["question"], citations=refs))
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

        raw_rows = list(qs.values("question", "citations"))
        logs_for_scenes = []
        for row in raw_rows:
            refs = [
                SceneReference(
                    video_id=rv.get("video_id"),
                    title=rv.get("title", ""),
                    start_time=rv.get("start_time"),
                    end_time=rv.get("end_time"),
                )
                for rv in (row["citations"] or [])
                if rv.get("video_id") and rv.get("start_time")
            ]
            logs_for_scenes.append(
                ChatSceneLog(question=row["question"], citations=refs)
            )

        time_series_qs = (
            qs.annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
            .values("date", "count")
        )
        time_series: List[TimeSeriesPoint] = []
        for entry in time_series_qs:
            time_series.append(
                TimeSeriesPoint(
                    date=entry["date"].isoformat(),
                    count=entry["count"],
                )
            )

        feedback_counts = qs.aggregate(
            good=Count("id", filter=Q(feedback="good")),
            bad=Count("id", filter=Q(feedback="bad")),
            none=Count("id", filter=Q(feedback__isnull=True)),
        )
        feedback = FeedbackSummary(
            good=feedback_counts.get("good", 0) or 0,
            bad=feedback_counts.get("bad", 0) or 0,
            none=feedback_counts.get("none", 0) or 0,
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
                group = queryset.get(id=group_id, share_slug=share_token)
            elif user_id:
                group = queryset.get(id=group_id, user_id=user_id)
            else:
                group = queryset.get(id=group_id)
        except VideoGroup.DoesNotExist:
            return None

        return _group_to_context_entity(group)
