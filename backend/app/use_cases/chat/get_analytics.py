"""
Use case: Build analytics dashboard data for a chat group.
"""

from typing import Optional

from django.db.models import Count, Q
from django.db.models.functions import TruncDate

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import aggregate_scenes, extract_keywords, filter_group_scenes
from app.models import ChatLog
from app.use_cases.video.exceptions import ResourceNotFound


class GetChatAnalyticsUseCase:
    """Aggregate chat analytics: summary, scene distribution, time series, feedback, keywords."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo

    def execute(self, group_id: int, user_id: int) -> dict:
        """
        Returns:
            dict with keys: summary, scene_distribution, time_series, feedback, keywords.

        Raises:
            ResourceNotFound: If the group does not exist.
        """
        group = self.group_query_repo.get_with_members(
            group_id=group_id, user_id=user_id
        )
        if group is None:
            raise ResourceNotFound("Group")

        chat_logs_qs = ChatLog.objects.filter(group=group)

        # Summary
        total = chat_logs_qs.count()
        date_range = {}
        if total > 0:
            first_log = (
                chat_logs_qs.order_by("created_at")
                .values_list("created_at", flat=True)
                .first()
            )
            last_log = (
                chat_logs_qs.order_by("-created_at")
                .values_list("created_at", flat=True)
                .first()
            )
            date_range = {
                "first": first_log.isoformat() if first_log else None,
                "last": last_log.isoformat() if last_log else None,
            }

        # Scene distribution
        logs_for_scenes = chat_logs_qs.values("question", "related_videos")
        scene_counter, scene_info, _ = aggregate_scenes(logs_for_scenes)
        valid_video_ids = {member.video_id for member in group.members.all()}
        top_scenes = filter_group_scenes(scene_counter, valid_video_ids)
        scene_distribution = [
            {
                "video_id": scene_info[key]["video_id"],
                "title": scene_info[key]["title"],
                "start_time": scene_info[key]["start_time"],
                "end_time": scene_info[key]["end_time"],
                "question_count": count,
            }
            for key, count in top_scenes
        ]

        # Time series (daily)
        time_series = list(
            chat_logs_qs.annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
            .values("date", "count")
        )
        for entry in time_series:
            entry["date"] = entry["date"].isoformat()

        # Feedback aggregation
        feedback_agg = chat_logs_qs.aggregate(
            good=Count("id", filter=Q(feedback="good")),
            bad=Count("id", filter=Q(feedback="bad")),
            none=Count("id", filter=Q(feedback__isnull=True)),
        )

        # Keywords
        questions = list(chat_logs_qs.values_list("question", flat=True))
        keywords = extract_keywords(questions)

        return {
            "summary": {
                "total_questions": total,
                "date_range": date_range,
            },
            "scene_distribution": scene_distribution,
            "time_series": time_series,
            "feedback": feedback_agg,
            "keywords": keywords,
        }
