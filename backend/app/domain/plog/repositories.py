"""Repository ports for PLOG."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from app.domain.plog.entities import (
    LearnerConceptStateEntity,
    PlogBuildJobEntity,
    PlogConceptEntity,
    PlogEdgeEntity,
    PlogGraphSnapshot,
    PlogLearningObjectEntity,
    PlogSummaryNodeEntity,
)


class PlogRepository(ABC):
    @abstractmethod
    def get_latest_build_job(self, video_id: int) -> PlogBuildJobEntity | None:
        ...

    @abstractmethod
    def create_build_job(self, video_id: int) -> PlogBuildJobEntity:
        ...

    @abstractmethod
    def update_build_job(
        self,
        job_id: int,
        *,
        status: str | None = None,
        error_message: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        finished: bool = False,
    ) -> PlogBuildJobEntity:
        ...

    @abstractmethod
    def delete_video_artifacts(self, video_id: int) -> None:
        ...

    @abstractmethod
    def save_summary_nodes(
        self, video_id: int, nodes: Sequence[dict]
    ) -> list[PlogSummaryNodeEntity]:
        ...

    @abstractmethod
    def save_concepts(
        self, video_id: int, concepts: Sequence[dict]
    ) -> list[PlogConceptEntity]:
        ...

    @abstractmethod
    def save_edges(self, video_id: int, edges: Sequence[dict]) -> list[PlogEdgeEntity]:
        ...

    @abstractmethod
    def save_learning_objects(
        self, objects: Sequence[dict]
    ) -> list[PlogLearningObjectEntity]:
        ...

    @abstractmethod
    def get_graph(self, video_id: int) -> PlogGraphSnapshot | None:
        ...

    @abstractmethod
    def list_ready_graphs(self, video_ids: Sequence[int]) -> list[PlogGraphSnapshot]:
        ...

    @abstractmethod
    def update_edge_validation(
        self, edge_id: int, video_id: int, validation_status: str
    ) -> PlogEdgeEntity | None:
        ...

    @abstractmethod
    def create_concept(
        self,
        video_id: int,
        *,
        label: str,
        node_type: str,
        intro_sec: float,
        source_quote: str,
        embedding: Sequence[float],
    ) -> PlogConceptEntity:
        ...

    @abstractmethod
    def update_concept(
        self,
        concept_id: int,
        video_id: int,
        *,
        label: str | None = None,
        node_type: str | None = None,
        intro_sec: float | None = None,
        source_quote: str | None = None,
        embedding: Sequence[float] | None = None,
    ) -> PlogConceptEntity | None:
        ...

    @abstractmethod
    def delete_concept(self, concept_id: int, video_id: int) -> bool:
        ...

    @abstractmethod
    def merge_concepts(
        self, video_id: int, *, survivor_id: int, absorb_id: int
    ) -> PlogConceptEntity | None:
        """Human adjudication: merge absorb into survivor (edges + LO), delete absorb."""
        ...

    @abstractmethod
    def get_concept(self, concept_id: int, video_id: int) -> PlogConceptEntity | None:
        ...

    @abstractmethod
    def get_learning_object(
        self, concept_id: int
    ) -> PlogLearningObjectEntity | None:
        ...

    @abstractmethod
    def ensure_learning_object(self, concept_id: int) -> PlogLearningObjectEntity:
        ...

    @abstractmethod
    def update_learning_object(
        self,
        concept_id: int,
        video_id: int,
        *,
        opening_question: str | None = None,
        hint_ladder: Sequence[str] | None = None,
        misconceptions: Sequence[str] | None = None,
        canonical_order: Sequence[str] | None = None,
        worked_examples: Sequence[str] | None = None,
        waypoints: Sequence[dict] | None = None,
    ) -> PlogLearningObjectEntity | None:
        ...

    @abstractmethod
    def create_edge(
        self,
        video_id: int,
        *,
        source_id: int,
        target_id: int,
        edge_type: str,
        quote: str,
        validation_status: str = "validated",
    ) -> PlogEdgeEntity:
        ...

    @abstractmethod
    def update_edge(
        self,
        edge_id: int,
        video_id: int,
        *,
        source_id: int | None = None,
        target_id: int | None = None,
        edge_type: str | None = None,
        quote: str | None = None,
        validation_status: str | None = None,
    ) -> PlogEdgeEntity | None:
        ...

    @abstractmethod
    def delete_edge(self, edge_id: int, video_id: int) -> bool:
        ...

    @abstractmethod
    def get_edge(self, edge_id: int, video_id: int) -> PlogEdgeEntity | None:
        ...

    @abstractmethod
    def ensure_ready_build_job(self, video_id: int) -> PlogBuildJobEntity:
        ...

    @abstractmethod
    def get_learner_state(
        self, user_id: int, concept_id: int
    ) -> LearnerConceptStateEntity | None:
        ...

    @abstractmethod
    def list_learner_states_for_video(
        self, user_id: int, video_id: int
    ) -> list[LearnerConceptStateEntity]:
        ...

    @abstractmethod
    def upsert_learner_state(
        self,
        user_id: int,
        concept_id: int,
        *,
        reached: bool | None = None,
        hint_index: int | None = None,
        last_grade: str | None = None,
        active: bool | None = None,
    ) -> LearnerConceptStateEntity:
        ...

    @abstractmethod
    def reset_learner_states_for_video(self, user_id: int, video_id: int) -> int:
        ...
