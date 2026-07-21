"""Learner concept state use cases."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

from app.domain.plog.repositories import PlogRepository
from app.domain.video.repositories import VideoQueryRepository
from app.use_cases.shared.exceptions import ResourceNotFound


@dataclass
class LearnerStateItemDTO:
    concept_id: int
    label: str
    reached: bool
    hint_index: int
    last_grade: str
    active: bool


class GetLearnerStateUseCase:
    def __init__(self, plog_repo: PlogRepository, video_repo: VideoQueryRepository):
        self.plog_repo = plog_repo
        self.video_repo = video_repo

    def execute(self, video_id: int, user_id: int) -> List[LearnerStateItemDTO]:
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")
        graph = self.plog_repo.get_graph(video_id)
        labels = {c.id: c.label for c in (graph.concepts if graph else [])}
        states = self.plog_repo.list_learner_states_for_video(user_id, video_id)
        return [
            LearnerStateItemDTO(
                concept_id=s.concept_id,
                label=labels.get(s.concept_id, ""),
                reached=s.reached,
                hint_index=s.hint_index,
                last_grade=s.last_grade,
                active=s.active,
            )
            for s in states
        ]


class ResetLearnerStateUseCase:
    def __init__(self, plog_repo: PlogRepository, video_repo: VideoQueryRepository):
        self.plog_repo = plog_repo
        self.video_repo = video_repo

    def execute(self, video_id: int, user_id: int) -> dict:
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")
        deleted = self.plog_repo.reset_learner_states_for_video(user_id, video_id)
        return {"deleted": deleted}
