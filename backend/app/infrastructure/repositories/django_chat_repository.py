"""
Django ORM implementations of chat domain repository interfaces.
"""

from typing import List, Optional

from django.db.models import Prefetch, QuerySet

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.models import ChatLog, VideoGroup, VideoGroupMember


class DjangoChatRepository(ChatRepository):
    """Django ORM implementation of ChatRepository."""

    def get_logs_for_group(
        self, group: VideoGroup, ascending: bool = True
    ) -> QuerySet:
        order_field = "created_at" if ascending else "-created_at"
        return group.chat_logs.select_related("user").order_by(order_field)

    def create_log(
        self,
        user,
        group: VideoGroup,
        question: str,
        answer: str,
        related_videos: List[dict],
        is_shared: bool,
    ) -> ChatLog:
        return ChatLog.objects.create(
            user=user,
            group=group,
            question=question,
            answer=answer,
            related_videos=related_videos,
            is_shared_origin=is_shared,
        )

    def get_log_by_id(self, log_id: int) -> Optional[ChatLog]:
        return ChatLog.objects.select_related("group").filter(id=log_id).first()

    def update_feedback(
        self, log: ChatLog, feedback: Optional[str]
    ) -> ChatLog:
        log.feedback = feedback
        log.save(update_fields=["feedback"])
        return log

    def get_logs_values_for_group(self, group: VideoGroup) -> QuerySet:
        return ChatLog.objects.filter(group=group).values(
            "question", "related_videos"
        )


class DjangoVideoGroupQueryRepository(VideoGroupQueryRepository):
    """Django ORM implementation of VideoGroupQueryRepository."""

    def get_with_members(
        self,
        group_id: int,
        user_id: Optional[int] = None,
        share_token: Optional[str] = None,
    ) -> Optional[VideoGroup]:
        queryset = VideoGroup.objects.select_related("user").prefetch_related(
            Prefetch(
                "members",
                queryset=VideoGroupMember.objects.select_related("video"),
            )
        )

        try:
            if share_token:
                return queryset.get(id=group_id, share_token=share_token)
            elif user_id:
                return queryset.get(id=group_id, user_id=user_id)
            else:
                return queryset.get(id=group_id)
        except VideoGroup.DoesNotExist:
            return None
