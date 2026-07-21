"""Repository ports for PLOG."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional, Sequence

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
    def get_latest_build_job(self, video_id: int) -> Optional[PlogBuildJobEntity]:
        ...

    @abstractmethod
    def create_build_job(self, video_id: int) -> PlogBuildJobEntity:
        ...

    @abstractmethod
    def update_build_job(
        self,
        job_id: int,
        *,
        status: Optional[str] = None,
        error_message: Optional[str] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        finished: bool = False,
    ) -> PlogBuildJobEntity:
        ...

    @abstractmethod
    def delete_video_artifacts(self, video_id: int) -> None:
        ...

    @abstractmethod
    def save_summary_nodes(
        self, video_id: int, nodes: Sequence[dict]
    ) -> List[PlogSummaryNodeEntity]:
        ...

    @abstractmethod
    def save_concepts(
        self, video_id: int, concepts: Sequence[dict]
    ) -> List[PlogConceptEntity]:
        ...

    @abstractmethod
    def save_edges(self, video_id: int, edges: Sequence[dict]) -> List[PlogEdgeEntity]:
        ...

    @abstractmethod
    def save_learning_objects(
        self, objects: Sequence[dict]
    ) -> List[PlogLearningObjectEntity]:
        ...

    @abstractmethod
    def get_graph(self, video_id: int) -> Optional[PlogGraphSnapshot]:
        ...

    @abstractmethod
    def list_ready_graphs(self, video_ids: Sequence[int]) -> List[PlogGraphSnapshot]:
        ...

    @abstractmethod
    def update_edge_validation(
        self, edge_id: int, video_id: int, validation_status: str
    ) -> Optional[PlogEdgeEntity]:
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
        label: Optional[str] = None,
        node_type: Optional[str] = None,
        intro_sec: Optional[float] = None,
        source_quote: Optional[str] = None,
        embedding: Optional[Sequence[float]] = None,
    ) -> Optional[PlogConceptEntity]:
        ...

    @abstractmethod
    def delete_concept(self, concept_id: int, video_id: int) -> bool:
        ...

    @abstractmethod
    def merge_concepts(
        self, video_id: int, *, survivor_id: int, absorb_id: int
    ) -> Optional[PlogConceptEntity]:
        """Human adjudication: merge absorb into survivor (edges + LO), delete absorb."""
        ...

    @abstractmethod
    def get_concept(self, concept_id: int, video_id: int) -> Optional[PlogConceptEntity]:
        ...

    @abstractmethod
    def get_learning_object(
        self, concept_id: int
    ) -> Optional[PlogLearningObjectEntity]:
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
        opening_question: Optional[str] = None,
        hint_ladder: Optional[Sequence[str]] = None,
        misconceptions: Optional[Sequence[str]] = None,
        canonical_order: Optional[Sequence[str]] = None,
        worked_examples: Optional[Sequence[str]] = None,
        waypoints: Optional[Sequence[dict]] = None,
    ) -> Optional[PlogLearningObjectEntity]:
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
        source_id: Optional[int] = None,
        target_id: Optional[int] = None,
        edge_type: Optional[str] = None,
        quote: Optional[str] = None,
        validation_status: Optional[str] = None,
    ) -> Optional[PlogEdgeEntity]:
        ...

    @abstractmethod
    def delete_edge(self, edge_id: int, video_id: int) -> bool:
        ...

    @abstractmethod
    def get_edge(self, edge_id: int, video_id: int) -> Optional[PlogEdgeEntity]:
        ...

    @abstractmethod
    def ensure_ready_build_job(self, video_id: int) -> PlogBuildJobEntity:
        ...

    @abstractmethod
    def get_learner_state(
        self, user_id: int, concept_id: int
    ) -> Optional[LearnerConceptStateEntity]:
        ...

    @abstractmethod
    def list_learner_states_for_video(
        self, user_id: int, video_id: int
    ) -> List[LearnerConceptStateEntity]:
        ...

    @abstractmethod
    def upsert_learner_state(
        self,
        user_id: int,
        concept_id: int,
        *,
        reached: Optional[bool] = None,
        hint_index: Optional[int] = None,
        last_grade: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> LearnerConceptStateEntity:
        ...

    @abstractmethod
    def reset_learner_states_for_video(self, user_id: int, video_id: int) -> int:
        ...
