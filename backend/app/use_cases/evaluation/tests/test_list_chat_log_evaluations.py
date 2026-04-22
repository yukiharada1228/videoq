"""TDD tests for ListChatLogEvaluationsUseCase."""

import unittest
from datetime import datetime, timezone
from typing import List, Optional

from app.domain.evaluation.entities import ChatLogEvaluationEntity
from app.domain.evaluation.ports import (
    EvaluationAggregateDTO,
    EvaluationRepository,
    VideoGroupOwnershipPort,
)
from app.use_cases.evaluation.list_chat_log_evaluations import ListChatLogEvaluationsUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


def _make_entity(chat_log_id: int, status: str = "completed") -> ChatLogEvaluationEntity:
    return ChatLogEvaluationEntity(
        id=chat_log_id,
        chat_log_id=chat_log_id,
        status=status,
        faithfulness=0.9,
        answer_relevancy=0.85,
        context_precision=0.7,
        error_message="",
        evaluated_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )


class _FakeEvaluationRepository(EvaluationRepository):
    def __init__(self, entities: List[ChatLogEvaluationEntity]):
        self._entities = entities

    def save(self, evaluation):
        return evaluation

    def get_by_chat_log_id(self, chat_log_id: int) -> Optional[ChatLogEvaluationEntity]:
        return None

    def list_by_group_id(self, group_id: int, limit: int = 50, offset: int = 0):
        return self._entities[offset : offset + limit]

    def get_aggregate_by_group_id(self, group_id: int) -> EvaluationAggregateDTO:
        return EvaluationAggregateDTO(
            group_id=group_id,
            evaluated_count=0,
            avg_faithfulness=None,
            avg_answer_relevancy=None,
            avg_context_precision=None,
        )


class _FakeGroupOwnership(VideoGroupOwnershipPort):
    def __init__(self, owned_group_ids: set):
        self._owned = owned_group_ids

    def is_owner(self, group_id: int, user_id: int) -> bool:
        return group_id in self._owned


class ListChatLogEvaluationsUseCaseTests(unittest.TestCase):
    def test_returns_evaluations_for_group(self):
        entities = [_make_entity(i) for i in range(1, 4)]
        uc = ListChatLogEvaluationsUseCase(
            evaluation_repo=_FakeEvaluationRepository(entities),
            group_ownership=_FakeGroupOwnership({1}),
        )

        result = uc.execute(group_id=1, user_id=10)

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0].chat_log_id, 1)

    def test_returns_empty_list_when_no_evaluations(self):
        uc = ListChatLogEvaluationsUseCase(
            evaluation_repo=_FakeEvaluationRepository([]),
            group_ownership=_FakeGroupOwnership({99}),
        )

        result = uc.execute(group_id=99, user_id=10)

        self.assertEqual(result, [])

    def test_respects_limit_and_offset(self):
        entities = [_make_entity(i) for i in range(1, 11)]
        uc = ListChatLogEvaluationsUseCase(
            evaluation_repo=_FakeEvaluationRepository(entities),
            group_ownership=_FakeGroupOwnership({1}),
        )

        result = uc.execute(group_id=1, user_id=10, limit=3, offset=2)

        # The fake slices from offset=2 with limit=3 → entities 3,4,5
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0].chat_log_id, 3)

    def test_raises_when_group_not_owned(self):
        entities = [_make_entity(1)]
        uc = ListChatLogEvaluationsUseCase(
            evaluation_repo=_FakeEvaluationRepository(entities),
            group_ownership=_FakeGroupOwnership(set()),
        )

        with self.assertRaises(ResourceNotFound):
            uc.execute(group_id=1, user_id=10)
