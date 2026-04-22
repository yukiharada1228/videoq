"""Use case: return aggregated RAGAS scores for a group."""

from app.domain.evaluation.ports import (
    EvaluationAggregateDTO,
    EvaluationRepository,
    VideoGroupOwnershipPort,
)
from app.use_cases.shared.exceptions import ResourceNotFound


class GetEvaluationSummaryUseCase:
    def __init__(
        self,
        evaluation_repo: EvaluationRepository,
        group_ownership: VideoGroupOwnershipPort,
    ):
        self.evaluation_repo = evaluation_repo
        self.group_ownership = group_ownership

    def execute(self, group_id: int, user_id: int) -> EvaluationAggregateDTO:
        if not self.group_ownership.is_owner(group_id=group_id, user_id=user_id):
            raise ResourceNotFound("Group")
        return self.evaluation_repo.get_aggregate_by_group_id(group_id)
