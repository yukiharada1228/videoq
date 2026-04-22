"""TDD tests for GetEvaluationSummaryUseCase."""

import unittest
from typing import List, Optional

from app.domain.evaluation.entities import ChatLogEvaluationEntity
from app.domain.evaluation.ports import (
    EvaluationAggregateDTO,
    EvaluationRepository,
    VideoGroupOwnershipPort,
)
from app.use_cases.evaluation.get_evaluation_summary import GetEvaluationSummaryUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _FakeEvaluationRepository(EvaluationRepository):
    def __init__(self, aggregate: EvaluationAggregateDTO):
        self._aggregate = aggregate

    def save(self, evaluation):
        return evaluation

    def get_by_chat_log_id(self, chat_log_id: int) -> Optional[ChatLogEvaluationEntity]:
        return None

    def list_by_group_id(self, group_id: int, limit: int = 50, offset: int = 0):
        return []

    def get_aggregate_by_group_id(self, group_id: int) -> EvaluationAggregateDTO:
        return self._aggregate


class _FakeGroupOwnership(VideoGroupOwnershipPort):
    def __init__(self, owned_group_ids: set):
        self._owned = owned_group_ids

    def is_owner(self, group_id: int, user_id: int) -> bool:
        return group_id in self._owned


class GetEvaluationSummaryUseCaseTests(unittest.TestCase):
    def test_returns_aggregate_for_group(self):
        expected = EvaluationAggregateDTO(
            group_id=1,
            evaluated_count=10,
            avg_faithfulness=0.85,
            avg_answer_relevancy=0.9,
            avg_context_precision=0.72,
        )
        uc = GetEvaluationSummaryUseCase(
            evaluation_repo=_FakeEvaluationRepository(expected),
            group_ownership=_FakeGroupOwnership({1}),
        )

        result = uc.execute(group_id=1, user_id=10)

        self.assertEqual(result.group_id, 1)
        self.assertEqual(result.evaluated_count, 10)
        self.assertAlmostEqual(result.avg_faithfulness, 0.85)
        self.assertAlmostEqual(result.avg_answer_relevancy, 0.9)
        self.assertAlmostEqual(result.avg_context_precision, 0.72)

    def test_returns_zeros_when_no_evaluations(self):
        empty = EvaluationAggregateDTO(
            group_id=2,
            evaluated_count=0,
            avg_faithfulness=None,
            avg_answer_relevancy=None,
            avg_context_precision=None,
        )
        uc = GetEvaluationSummaryUseCase(
            evaluation_repo=_FakeEvaluationRepository(empty),
            group_ownership=_FakeGroupOwnership({2}),
        )

        result = uc.execute(group_id=2, user_id=10)

        self.assertEqual(result.evaluated_count, 0)
        self.assertIsNone(result.avg_faithfulness)

    def test_raises_when_group_not_owned(self):
        empty = EvaluationAggregateDTO(
            group_id=99,
            evaluated_count=0,
            avg_faithfulness=None,
            avg_answer_relevancy=None,
            avg_context_precision=None,
        )
        uc = GetEvaluationSummaryUseCase(
            evaluation_repo=_FakeEvaluationRepository(empty),
            group_ownership=_FakeGroupOwnership(set()),  # owns nothing
        )

        with self.assertRaises(ResourceNotFound):
            uc.execute(group_id=99, user_id=10)
