"""Tests for GetChatHistoryUseCase."""

from datetime import datetime, timezone
import unittest

from app.domain.chat.dtos import RelatedVideoDTO
from app.domain.chat.entities import ChatLogEntity, VideoGroupContextEntity
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.chat.get_history import GetChatHistoryUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _StubChatRepository(ChatRepository):
    def __init__(self, logs):
        self._logs = logs

    def get_logs_for_group(self, group_id: int, ascending: bool = True):
        return self._logs

    def create_log(self, user_id, group_id, question, answer, related_videos, is_shared):
        raise NotImplementedError

    def get_log_by_id(self, log_id: int):
        raise NotImplementedError

    def update_feedback(self, log, feedback):
        raise NotImplementedError

    def get_logs_values_for_group(self, group_id: int):
        raise NotImplementedError

    def get_analytics_raw(self, group_id: int):
        raise NotImplementedError


class _StubGroupRepository(VideoGroupQueryRepository):
    def __init__(self, group):
        self._group = group

    def get_with_members(self, group_id: int, user_id=None, share_token=None):
        return self._group


class GetChatHistoryUseCaseTests(unittest.TestCase):
    def test_execute_returns_chat_log_response_dto_list(self):
        group = VideoGroupContextEntity(id=5, user_id=1, name="g1")
        logs = [
            ChatLogEntity(
                id=10,
                user_id=1,
                group_id=5,
                group_user_id=1,
                group_share_token=None,
                question="q",
                answer="a",
                related_videos=[
                    RelatedVideoDTO(
                        video_id=100,
                        title="v1",
                        start_time="00:00:01",
                        end_time="00:00:03",
                    )
                ],
                is_shared_origin=False,
                feedback="good",
                created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            )
        ]
        use_case = GetChatHistoryUseCase(
            chat_repo=_StubChatRepository(logs),
            group_query_repo=_StubGroupRepository(group),
        )

        result = use_case.execute(group_id=5, user_id=1)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].id, 10)
        self.assertEqual(result[0].group_id, 5)
        self.assertEqual(result[0].related_videos[0]["video_id"], 100)

    def test_execute_raises_when_group_not_found(self):
        use_case = GetChatHistoryUseCase(
            chat_repo=_StubChatRepository([]),
            group_query_repo=_StubGroupRepository(None),
        )

        with self.assertRaises(ResourceNotFound):
            use_case.execute(group_id=999, user_id=1)
