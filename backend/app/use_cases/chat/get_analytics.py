"""
Use case: Build analytics dashboard data for a chat group.
"""

from app.domain.chat.ports import KeywordExtractor
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import aggregate_scenes, filter_group_scenes
from app.use_cases.chat.dto import ChatAnalyticsDTO, SceneDistributionItemDTO
from app.use_cases.shared.exceptions import ResourceNotFound


class GetChatAnalyticsUseCase:
    """Aggregate chat analytics: summary, scene distribution, time series, feedback, keywords."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
        keyword_extractor: KeywordExtractor,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.keyword_extractor = keyword_extractor

    def execute(self, group_id: int, user_id: int) -> ChatAnalyticsDTO:
        """
        Returns:
            ChatAnalyticsDTO with summary, scene_distribution, time_series, feedback, keywords.

        Raises:
            ResourceNotFound: If the group does not exist.
        """
        group = self.group_query_repo.get_with_members(
            group_id=group_id, user_id=user_id
        )
        if group is None:
            raise ResourceNotFound("Group")

        raw = self.chat_repo.get_analytics_raw(group_id)

        date_range = {}
        if raw.total > 0:
            date_range = {
                "first": raw.first_date.isoformat() if raw.first_date else None,
                "last": raw.last_date.isoformat() if raw.last_date else None,
            }

        scene_counter, scene_info, _ = aggregate_scenes(raw.logs_for_scenes)
        valid_video_ids = {member.video_id for member in group.members}
        top_scenes = filter_group_scenes(scene_counter, valid_video_ids)
        scene_distribution = [
            SceneDistributionItemDTO(
                video_id=scene_info[key]["video_id"],
                title=scene_info[key]["title"],
                start_time=scene_info[key]["start_time"],
                end_time=scene_info[key]["end_time"],
                question_count=count,
            )
            for key, count in top_scenes
        ]

        keywords = self.keyword_extractor.extract(raw.questions)

        return ChatAnalyticsDTO(
            total_questions=raw.total,
            date_range=date_range,
            scene_distribution=scene_distribution,
            time_series=raw.time_series,
            feedback=raw.feedback,
            keywords=keywords,
        )
