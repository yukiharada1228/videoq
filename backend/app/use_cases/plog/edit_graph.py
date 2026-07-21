"""Use cases: manually create / update / delete PLOG graph entities."""

from __future__ import annotations

from typing import Optional, Sequence

from app.domain.plog.gateways import PlogEmbeddingGateway
from app.domain.plog.repositories import PlogRepository
from app.domain.video.repositories import VideoQueryRepository
from app.use_cases.plog.get_graph import (
    PlogEdgeDTO,
    concept_dto_to_dict,
    concept_to_dto,
    edge_dto_to_dict,
)
from app.use_cases.plog.ordering import EDGE_TYPES, NODE_TYPES, ORDERING, is_dag
from app.use_cases.shared.exceptions import ResourceNotFound


class EditPlogGraphUseCase:
    def __init__(
        self,
        plog_repo: PlogRepository,
        video_repo: VideoQueryRepository,
        embedding_gateway: PlogEmbeddingGateway,
    ):
        self.plog_repo = plog_repo
        self.video_repo = video_repo
        self.embedding_gateway = embedding_gateway

    def _require_video(self, video_id: int, user_id: int) -> None:
        if self.video_repo.get_by_id(video_id, user_id) is None:
            raise ResourceNotFound("Video")

    def _edge_dto(self, edge, graph) -> dict:
        concepts_by_id = {c.id: c for c in graph.concepts} if graph else {}
        src = concepts_by_id.get(edge.source_id)
        tgt = concepts_by_id.get(edge.target_id)
        return edge_dto_to_dict(
            PlogEdgeDTO(
                id=edge.id,
                source_id=edge.source_id,
                source_label=src.label if src else "",
                target_id=edge.target_id,
                target_label=tgt.label if tgt else "",
                edge_type=edge.edge_type,
                quote=edge.quote,
            )
        )

    def _concept_response(self, video_id: int, concept_id: int) -> dict:
        concept = self.plog_repo.get_concept(concept_id, video_id)
        if concept is None:
            raise ResourceNotFound("Concept")
        lo = self.plog_repo.get_learning_object(concept_id)
        return concept_dto_to_dict(concept_to_dto(concept, lo))

    def _assert_ordering_dag(
        self,
        video_id: int,
        *,
        proposed_source_id: int,
        proposed_target_id: int,
        proposed_edge_type: str,
        exclude_edge_id: Optional[int] = None,
    ) -> None:
        if proposed_edge_type not in ORDERING:
            return
        graph = self.plog_repo.get_graph(video_id)
        pairs = []
        if graph:
            for e in graph.edges:
                if exclude_edge_id is not None and e.id == exclude_edge_id:
                    continue
                if e.edge_type not in ORDERING:
                    continue
                pairs.append((str(e.source_id), str(e.target_id)))
        pairs.append((str(proposed_source_id), str(proposed_target_id)))
        if not is_dag(pairs):
            raise ValueError("Ordering edges must form a DAG (cycle detected).")

    def create_concept(
        self,
        video_id: int,
        user_id: int,
        *,
        label: str,
        node_type: str = "object",
        intro_sec: float = 0.0,
        source_quote: str = "",
    ) -> dict:
        self._require_video(video_id, user_id)
        label = (label or "").strip()
        if not label:
            raise ValueError("label is required")
        if node_type not in NODE_TYPES:
            raise ValueError(f"Invalid node_type: {node_type}")
        self.plog_repo.ensure_ready_build_job(video_id)
        try:
            embedding = self.embedding_gateway.embed_texts([label])[0]
        except Exception as exc:
            raise ValueError(f"Failed to embed concept label: {exc}") from exc
        concept = self.plog_repo.create_concept(
            video_id,
            label=label,
            node_type=node_type,
            intro_sec=float(intro_sec or 0.0),
            source_quote=source_quote or "",
            embedding=embedding,
        )
        return self._concept_response(video_id, concept.id)

    def update_concept(
        self,
        video_id: int,
        user_id: int,
        concept_id: int,
        *,
        label: Optional[str] = None,
        node_type: Optional[str] = None,
        intro_sec: Optional[float] = None,
        source_quote: Optional[str] = None,
    ) -> dict:
        self._require_video(video_id, user_id)
        existing = self.plog_repo.get_concept(concept_id, video_id)
        if existing is None:
            raise ResourceNotFound("Concept")
        if node_type is not None and node_type not in NODE_TYPES:
            raise ValueError(f"Invalid node_type: {node_type}")
        embedding = None
        if label is not None:
            label = label.strip()
            if not label:
                raise ValueError("label cannot be empty")
            if label != existing.label:
                try:
                    embedding = self.embedding_gateway.embed_texts([label])[0]
                except Exception as exc:
                    raise ValueError(f"Failed to embed concept label: {exc}") from exc
        updated = self.plog_repo.update_concept(
            concept_id,
            video_id,
            label=label,
            node_type=node_type,
            intro_sec=intro_sec,
            source_quote=source_quote,
            embedding=embedding,
        )
        if updated is None:
            raise ResourceNotFound("Concept")
        return self._concept_response(video_id, concept_id)

    def delete_concept(self, video_id: int, user_id: int, concept_id: int) -> dict:
        self._require_video(video_id, user_id)
        if not self.plog_repo.delete_concept(concept_id, video_id):
            raise ResourceNotFound("Concept")
        return {"deleted": True, "id": concept_id}

    def merge_concepts(
        self,
        video_id: int,
        user_id: int,
        *,
        survivor_id: int,
        absorb_id: int,
    ) -> dict:
        """Paper §3.1 / §4: human synonym / granularity merge."""
        self._require_video(video_id, user_id)
        if survivor_id == absorb_id:
            raise ValueError("survivor_id and absorb_id must differ")
        if self.plog_repo.get_concept(survivor_id, video_id) is None:
            raise ResourceNotFound("Concept")
        if self.plog_repo.get_concept(absorb_id, video_id) is None:
            raise ResourceNotFound("Concept")
        merged = self.plog_repo.merge_concepts(
            video_id, survivor_id=survivor_id, absorb_id=absorb_id
        )
        if merged is None:
            raise ResourceNotFound("Concept")
        return self._concept_response(video_id, survivor_id)

    def update_learning_object(
        self,
        video_id: int,
        user_id: int,
        concept_id: int,
        *,
        opening_question: Optional[str] = None,
        hint_ladder: Optional[Sequence[str]] = None,
        misconceptions: Optional[Sequence[str]] = None,
        canonical_order: Optional[Sequence[str]] = None,
        worked_examples: Optional[Sequence[str]] = None,
        waypoints: Optional[Sequence[dict]] = None,
    ) -> dict:
        self._require_video(video_id, user_id)
        lo = self.plog_repo.update_learning_object(
            concept_id,
            video_id,
            opening_question=opening_question,
            hint_ladder=hint_ladder,
            misconceptions=misconceptions,
            canonical_order=canonical_order,
            worked_examples=worked_examples,
            waypoints=waypoints,
        )
        if lo is None:
            raise ResourceNotFound("Concept")
        return self._concept_response(video_id, concept_id)

    def create_edge(
        self,
        video_id: int,
        user_id: int,
        *,
        source_id: int,
        target_id: int,
        edge_type: str,
        quote: str = "",
    ) -> dict:
        self._require_video(video_id, user_id)
        if edge_type not in EDGE_TYPES:
            raise ValueError(f"Invalid edge_type: {edge_type}")
        if source_id == target_id:
            raise ValueError("source_id and target_id must differ")
        if self.plog_repo.get_concept(source_id, video_id) is None:
            raise ValueError("source_id does not exist for this video")
        if self.plog_repo.get_concept(target_id, video_id) is None:
            raise ValueError("target_id does not exist for this video")
        self.plog_repo.ensure_ready_build_job(video_id)
        self._assert_ordering_dag(
            video_id,
            proposed_source_id=source_id,
            proposed_target_id=target_id,
            proposed_edge_type=edge_type,
        )
        edge = self.plog_repo.create_edge(
            video_id,
            source_id=source_id,
            target_id=target_id,
            edge_type=edge_type,
            quote=quote or "",
        )
        graph = self.plog_repo.get_graph(video_id)
        return self._edge_dto(edge, graph)

    def update_edge(
        self,
        video_id: int,
        user_id: int,
        edge_id: int,
        *,
        source_id: Optional[int] = None,
        target_id: Optional[int] = None,
        edge_type: Optional[str] = None,
        quote: Optional[str] = None,
    ) -> dict:
        self._require_video(video_id, user_id)
        existing = self.plog_repo.get_edge(edge_id, video_id)
        if existing is None:
            raise ResourceNotFound("Edge")
        next_source = source_id if source_id is not None else existing.source_id
        next_target = target_id if target_id is not None else existing.target_id
        next_type = edge_type if edge_type is not None else existing.edge_type
        if edge_type is not None and edge_type not in EDGE_TYPES:
            raise ValueError(f"Invalid edge_type: {edge_type}")
        if next_source == next_target:
            raise ValueError("source_id and target_id must differ")
        if self.plog_repo.get_concept(next_source, video_id) is None:
            raise ValueError("source_id does not exist for this video")
        if self.plog_repo.get_concept(next_target, video_id) is None:
            raise ValueError("target_id does not exist for this video")
        self._assert_ordering_dag(
            video_id,
            proposed_source_id=next_source,
            proposed_target_id=next_target,
            proposed_edge_type=next_type,
            exclude_edge_id=edge_id,
        )
        edge = self.plog_repo.update_edge(
            edge_id,
            video_id,
            source_id=source_id,
            target_id=target_id,
            edge_type=edge_type,
            quote=quote,
        )
        if edge is None:
            raise ResourceNotFound("Edge")
        graph = self.plog_repo.get_graph(video_id)
        return self._edge_dto(edge, graph)

    def delete_edge(self, video_id: int, user_id: int, edge_id: int) -> dict:
        self._require_video(video_id, user_id)
        if not self.plog_repo.delete_edge(edge_id, video_id):
            raise ResourceNotFound("Edge")
        return {"deleted": True, "id": edge_id}
