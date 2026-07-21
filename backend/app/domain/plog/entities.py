"""Domain entities for PLOG."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class PlogSummaryNodeEntity:
    id: int
    video_id: int
    parent_id: Optional[int]
    level: int
    text: str
    start_sec: float
    end_sec: float
    scene_indices: List[int] = field(default_factory=list)
    embedding: List[float] = field(default_factory=list)


@dataclass
class PlogConceptEntity:
    id: int
    video_id: int
    label: str
    node_type: str
    intro_sec: float
    source_quote: str = ""
    embedding: List[float] = field(default_factory=list)


@dataclass
class PlogEdgeEntity:
    id: int
    video_id: int
    source_id: int
    target_id: int
    edge_type: str
    quote: str = ""
    validation_status: str = "validated"


@dataclass
class PlogLearningObjectEntity:
    id: int
    concept_id: int
    opening_question: str = ""
    hint_ladder: List[str] = field(default_factory=list)
    misconceptions: List[str] = field(default_factory=list)
    canonical_order: List[str] = field(default_factory=list)
    worked_examples: List[str] = field(default_factory=list)
    waypoints: List[dict] = field(default_factory=list)


@dataclass
class PlogBuildJobEntity:
    id: int
    video_id: int
    status: str
    error_message: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class LearnerConceptStateEntity:
    id: int
    user_id: int
    concept_id: int
    reached: bool = False
    hint_index: int = 0
    last_grade: str = ""
    active: bool = False


@dataclass
class PlogGraphSnapshot:
    """In-memory graph for a single video used at runtime."""

    video_id: int
    concepts: List[PlogConceptEntity]
    edges: List[PlogEdgeEntity]
    learning_objects: dict[int, PlogLearningObjectEntity]
    summary_nodes: List[PlogSummaryNodeEntity]
    build_status: str
