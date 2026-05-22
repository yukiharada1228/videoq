"""Tests for ResetChatHistoryUseCase."""

import unittest
from typing import Optional

from app.domain.chat.entities import VideoGroupContextEntity
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.chat.reset_history import ResetChatHistoryUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _StubChatRepository(ChatRepository):
    def __init__(self):
        self.deleted_group_ids: list[int] = []

    def get_logs_for_group(self, group_id: int, ascending: bool = True):
        return []

    def create_log(self, user_id, group_id, question, answer, citations, is_shared, retrieved_contexts=None):
        raise NotImplementedError

    def get_log_by_id(self, log_id: int):
        raise NotImplementedError

    def update_feedback(self, log, feedback):
        raise NotImplementedError

    def get_logs_values_for_group(self, group_id: int):
        raise NotImplementedError

    def get_analytics_raw(self, group_id: int):
        raise NotImplementedError

    def delete_logs_for_group(self, group_id: int) -> None:
        self.deleted_group_ids.append(group_id)


class _StubGroupRepository(VideoGroupQueryRepository):
    def __init__(self, group: Optional[VideoGroupContextEntity]):
        self._group = group

    def get_with_members(self, group_id: int, user_id=None, share_token=None):
        return self._group


class ResetChatHistoryUseCaseTests(unittest.TestCase):
    def _make_use_case(self, group=None):
        self.chat_repo = _StubChatRepository()
        group_repo = _StubGroupRepository(group)
        return ResetChatHistoryUseCase(self.chat_repo, group_repo)

    def test_execute_deletes_logs_for_owned_group(self):
        group = VideoGroupContextEntity(id=5, user_id=1, name="g")
        use_case = self._make_use_case(group=group)
        use_case.execute(group_id=5, user_id=1)
        self.assertIn(5, self.chat_repo.deleted_group_ids)

    def test_execute_raises_resource_not_found_when_group_missing(self):
        use_case = self._make_use_case(group=None)
        with self.assertRaises(ResourceNotFound):
            use_case.execute(group_id=99, user_id=1)

    def test_execute_raises_resource_not_found_when_group_belongs_to_other_user(self):
        # group_query_repo.get_with_members returns None when user_id doesn't match
        use_case = self._make_use_case(group=None)
        with self.assertRaises(ResourceNotFound):
            use_case.execute(group_id=5, user_id=999)
