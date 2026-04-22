"""Use case: list per-ChatLog evaluation results for a group."""

from typing import List

from app.domain.evaluation.entities import ChatLogEvaluationEntity
from app.domain.evaluation.ports import EvaluationRepository, VideoGroupOwnershipPort
from app.use_cases.shared.exceptions import ResourceNotFound


class ListChatLogEvaluationsUseCase:
    def __init__(
        self,
        evaluation_repo: EvaluationRepository,
        group_ownership: VideoGroupOwnershipPort,
    ):
        self.evaluation_repo = evaluation_repo
        self.group_ownership = group_ownership

    def execute(
        self,
        group_id: int,
        user_id: int,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ChatLogEvaluationEntity]:
        if not self.group_ownership.is_owner(group_id=group_id, user_id=user_id):
            raise ResourceNotFound("Group")
        return self.evaluation_repo.list_by_group_id(
            group_id=group_id,
            limit=limit,
            offset=offset,
        )
