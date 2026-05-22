"""Tests for GetChatAnalyticsUseCase — scene_distribution must not be present."""

import unittest
from datetime import datetime
from typing import List, Optional

from app.domain.chat.entities import ChatAnalyticsRaw, VideoGroupContextEntity
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.value_objects import FeedbackSummary, TimeSeriesPoint
from app.use_cases.chat.get_analytics import GetChatAnalyticsUseCase
from app.use_cases.shared.exceptions import ResourceNotFound

_SENTINEL = object()


class _StubChatRepository(ChatRepository):
    def __init__(self, raw: ChatAnalyticsRaw):
        self._raw = raw
        self.analytics_raw_call_count = 0

    def get_analytics_raw(self, group_id: int) -> ChatAnalyticsRaw:
        self.analytics_raw_call_count += 1
        return self._raw

    def get_logs_for_group(self, group_id, ascending=True):
        raise NotImplementedError

    def create_log(self, *args, **kwargs):
        raise NotImplementedError

    def get_log_by_id(self, log_id):
        raise NotImplementedError

    def update_feedback(self, log, feedback):
        raise NotImplementedError

    def get_logs_values_for_group(self, group_id):
        raise NotImplementedError

    def get_questions_for_group(self, group_id):
        raise NotImplementedError

    def delete_logs_for_group(self, group_id):
        raise NotImplementedError


class _StubGroupRepository(VideoGroupQueryRepository):
    def __init__(self, group: Optional[VideoGroupContextEntity]):
        self._group = group

    def get_with_members(self, group_id, user_id=None, share_token=None):
        return self._group


def _make_raw(total: int = 0) -> ChatAnalyticsRaw:
    return ChatAnalyticsRaw(
        total=total,
        first_date=None,
        last_date=None,
        time_series=[],
        feedback=FeedbackSummary(good=0, bad=0, none=0),
    )


def _make_group() -> VideoGroupContextEntity:
    return VideoGroupContextEntity(id=1, user_id=42, name="g1")


class GetChatAnalyticsUseCaseTests(unittest.TestCase):
    def _make_use_case(self, raw=None, group=_SENTINEL):
        resolved_group = _make_group() if group is _SENTINEL else group
        return GetChatAnalyticsUseCase(
            chat_repo=_StubChatRepository(raw or _make_raw()),
            group_query_repo=_StubGroupRepository(resolved_group),
        )

    def test_dto_has_no_scene_distribution_field(self):
        """ChatAnalyticsDTO must not expose scene_distribution."""
        use_case = self._make_use_case()
        dto = use_case.execute(group_id=1, user_id=42)
        self.assertFalse(hasattr(dto, "scene_distribution"))

    def test_dto_contains_expected_fields(self):
        raw = ChatAnalyticsRaw(
            total=5,
            first_date=datetime(2026, 1, 1),
            last_date=datetime(2026, 1, 5),
            time_series=[TimeSeriesPoint(date="2026-01-01", count=3)],
            feedback=FeedbackSummary(good=2, bad=1, none=2),
        )
        use_case = self._make_use_case(raw=raw)
        dto = use_case.execute(group_id=1, user_id=42)

        self.assertEqual(dto.total_questions, 5)
        self.assertIn("2026-01-01", dto.date_range.first)
        self.assertIn("2026-01-05", dto.date_range.last)
        self.assertEqual(len(dto.time_series), 1)
        self.assertEqual(dto.time_series[0].count, 3)
        self.assertEqual(dto.feedback.good, 2)
        self.assertEqual(dto.feedback.bad, 1)
        self.assertEqual(dto.feedback.none, 2)

    def test_raises_resource_not_found_when_group_missing(self):
        use_case = self._make_use_case(group=None)
        with self.assertRaises(ResourceNotFound):
            use_case.execute(group_id=999, user_id=42)

    def test_get_analytics_raw_is_called_once(self):
        repo = _StubChatRepository(_make_raw())
        use_case = GetChatAnalyticsUseCase(
            chat_repo=repo,
            group_query_repo=_StubGroupRepository(_make_group()),
        )
        use_case.execute(group_id=1, user_id=42)
        self.assertEqual(repo.analytics_raw_call_count, 1)
