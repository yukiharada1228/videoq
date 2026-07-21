"""Use case: get PLOG graph summary for a video."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from app.domain.plog.repositories import PlogRepository
from app.domain.video.repositories import VideoQueryRepository
from app.use_cases.shared.exceptions import ResourceNotFound


@dataclass
class PlogEdgeDTO:
    id: int
    source_id: int
    source_label: str
    target_id: int
    target_label: str
    edge_type: str
    quote: str


@dataclass
class PlogConceptDTO:
    id: int
    label: str
    node_type: str
    intro_sec: float
    source_quote: str
    opening_question: str
    hint_ladder: List[str] = field(default_factory=list)
    misconceptions: List[str] = field(default_factory=list)
    canonical_order: List[str] = field(default_factory=list)
    worked_examples: List[str] = field(default_factory=list)
    waypoints: List[Dict[str, Any]] = field(default_factory=list)
    hint_count: int = 0
    waypoint_count: int = 0


@dataclass
class PlogGraphDTO:
    video_id: int
    build_status: str
    input_tokens: int
    output_tokens: int
    error_message: str
    concepts: List[PlogConceptDTO]
    edges: List[PlogEdgeDTO]
    summary_node_count: int


def concept_to_dto(concept, learning_object) -> PlogConceptDTO:
    lo = learning_object
    hint_ladder = list(lo.hint_ladder) if lo else []
    waypoints = list(lo.waypoints) if lo else []
    return PlogConceptDTO(
        id=concept.id,
        label=concept.label,
        node_type=concept.node_type,
        intro_sec=concept.intro_sec,
        source_quote=concept.source_quote or "",
        opening_question=lo.opening_question if lo else "",
        hint_ladder=hint_ladder,
        misconceptions=list(lo.misconceptions) if lo else [],
        canonical_order=list(lo.canonical_order) if lo else [],
        worked_examples=list(lo.worked_examples) if lo else [],
        waypoints=waypoints,
        hint_count=len(hint_ladder),
        waypoint_count=len(waypoints),
    )


def concept_dto_to_dict(c: PlogConceptDTO) -> dict:
    return {
        "id": c.id,
        "label": c.label,
        "node_type": c.node_type,
        "intro_sec": c.intro_sec,
        "source_quote": c.source_quote,
        "opening_question": c.opening_question,
        "hint_ladder": c.hint_ladder,
        "misconceptions": c.misconceptions,
        "canonical_order": c.canonical_order,
        "worked_examples": c.worked_examples,
        "waypoints": c.waypoints,
        "hint_count": c.hint_count,
        "waypoint_count": c.waypoint_count,
    }


def edge_dto_to_dict(e: PlogEdgeDTO) -> dict:
    return {
        "id": e.id,
        "source_id": e.source_id,
        "source_label": e.source_label,
        "target_id": e.target_id,
        "target_label": e.target_label,
        "edge_type": e.edge_type,
        "quote": e.quote,
    }


class GetPlogGraphUseCase:
    def __init__(self, plog_repo: PlogRepository, video_repo: VideoQueryRepository):
        self.plog_repo = plog_repo
        self.video_repo = video_repo

    def execute(self, video_id: int, user_id: int) -> PlogGraphDTO:
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        job = self.plog_repo.get_latest_build_job(video_id)
        graph = self.plog_repo.get_graph(video_id)
        if job is None:
            return PlogGraphDTO(
                video_id=video_id,
                build_status="missing",
                input_tokens=0,
                output_tokens=0,
                error_message="",
                concepts=[],
                edges=[],
                summary_node_count=0,
            )

        concepts_by_id = {c.id: c for c in (graph.concepts if graph else [])}
        concept_dtos: List[PlogConceptDTO] = []
        if graph:
            for c in graph.concepts:
                lo = graph.learning_objects.get(c.id)
                concept_dtos.append(concept_to_dto(c, lo))

        edge_dtos: List[PlogEdgeDTO] = []
        if graph:
            for e in graph.edges:
                src = concepts_by_id.get(e.source_id)
                tgt = concepts_by_id.get(e.target_id)
                edge_dtos.append(
                    PlogEdgeDTO(
                        id=e.id,
                        source_id=e.source_id,
                        source_label=src.label if src else "",
                        target_id=e.target_id,
                        target_label=tgt.label if tgt else "",
                        edge_type=e.edge_type,
                        quote=e.quote,
                    )
                )

        return PlogGraphDTO(
            video_id=video_id,
            build_status=job.status,
            input_tokens=job.input_tokens,
            output_tokens=job.output_tokens,
            error_message=job.error_message,
            concepts=concept_dtos,
            edges=edge_dtos,
            summary_node_count=len(graph.summary_nodes) if graph else 0,
        )
