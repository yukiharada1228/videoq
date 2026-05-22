"""
Use case: Build analytics dashboard data for a chat group.
"""

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import (
    GroupContextNotFound as _DomainGroupContextNotFound,
    require_group_context,
)
from app.use_cases.chat.dto import (
    ChatAnalyticsDTO,
    DateRangeDTO,
    FeedbackSummaryDTO,
    TimeSeriesPointDTO,
)
from app.use_cases.shared.exceptions import ResourceNotFound


class GetChatAnalyticsUseCase:
    """Aggregate chat analytics: summary, time series, feedback."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo

    def execute(self, group_id: int, user_id: int) -> ChatAnalyticsDTO:
        """
        Returns:
            ChatAnalyticsDTO with summary, time_series, feedback.

        Raises:
            ResourceNotFound: If the group does not exist.
        """
        try:
            require_group_context(
                self.group_query_repo.get_with_members(group_id=group_id, user_id=user_id)
            )
        except _DomainGroupContextNotFound:
            raise ResourceNotFound("Group")

        raw = self.chat_repo.get_analytics_raw(group_id)

        date_range = DateRangeDTO(
            first=raw.first_date.isoformat() if raw.first_date else None,
            last=raw.last_date.isoformat() if raw.last_date else None,
        )

        return ChatAnalyticsDTO(
            total_questions=raw.total,
            date_range=date_range,
            time_series=[
                TimeSeriesPointDTO(date=item.date, count=item.count)
                for item in raw.time_series
            ],
            feedback=FeedbackSummaryDTO(
                good=raw.feedback.good,
                bad=raw.feedback.bad,
                none=raw.feedback.none,
            ),
        )
