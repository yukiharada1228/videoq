"""Use case: build PLOG artifacts for a video (offline pipeline)."""

from __future__ import annotations

import logging
from typing import Callable, List, Optional, Sequence

from app.domain.plog.gateways import (
    ExtractedConcept,
    ExtractedEdge,
    PlogConceptExtractor,
    PlogEmbeddingGateway,
    PlogHierarchyBuilder,
    TokenUsage,
)
from app.domain.plog.repositories import PlogRepository
from app.domain.video.repositories import VideoTranscriptionRepository

logger = logging.getLogger(__name__)

ParseScenesFn = Callable[[str], List[dict]]
MergeConceptsFn = Callable[[Sequence[ExtractedConcept]], List[ExtractedConcept]]
ApplyChecksFn = Callable[
    [Sequence[ExtractedConcept], Sequence[ExtractedEdge], str, Sequence[dict]],
    tuple[dict[str, float], List[ExtractedEdge]],
]


class BuildPlogArtifactsUseCase:
    def __init__(
        self,
        video_repo: VideoTranscriptionRepository,
        plog_repo: PlogRepository,
        hierarchy_builder: PlogHierarchyBuilder,
        concept_extractor: PlogConceptExtractor,
        embedding_gateway: PlogEmbeddingGateway,
        *,
        parse_scenes: ParseScenesFn,
        merge_concepts: MergeConceptsFn,
        apply_checks: ApplyChecksFn,
    ):
        self.video_repo = video_repo
        self.plog_repo = plog_repo
        self.hierarchy_builder = hierarchy_builder
        self.concept_extractor = concept_extractor
        self.embedding_gateway = embedding_gateway
        self.parse_scenes = parse_scenes
        self.merge_concepts = merge_concepts
        self.apply_checks = apply_checks

    def execute(self, video_id: int, api_key: Optional[str] = None) -> None:
        video = self.video_repo.get_by_id_for_task(video_id)
        if video is None or not video.transcript:
            raise ValueError(f"Video {video_id} missing or has no transcript")

        latest = self.plog_repo.get_latest_build_job(video_id)
        if latest and latest.status in {"pending", "running"}:
            job = self.plog_repo.update_build_job(latest.id, status="running")
        else:
            job = self.plog_repo.create_build_job(video_id)
            job = self.plog_repo.update_build_job(job.id, status="running")
        usage = TokenUsage()

        try:
            scenes = self.parse_scenes(video.transcript)
            for i, sc in enumerate(scenes):
                sc.setdefault("index", sc.get("scene_index", i + 1))
                sc.setdefault("scene_index", sc["index"])

            self.plog_repo.delete_video_artifacts(video_id)

            hierarchy = self.hierarchy_builder.build(scenes, api_key=api_key)
            usage = usage.add(hierarchy.usage)

            stage1 = self.concept_extractor.extract_inventory(
                video.transcript, scenes, api_key=api_key
            )
            usage = usage.add(stage1.usage)
            if not stage1.concepts:
                raise RuntimeError("Stage1 produced no concepts")

            concepts = self.merge_concepts(stage1.concepts)
            if len(concepts) < len(stage1.concepts):
                logger.info(
                    "PLOG merged Stage1 inventory %s -> %s concepts (synonym/granularity)",
                    len(stage1.concepts),
                    len(concepts),
                )

            stage2 = self.concept_extractor.extract_edges_and_objects(
                video.transcript, concepts, scenes, api_key=api_key
            )
            usage = usage.add(stage2.usage)

            intro, edges = self.apply_checks(
                concepts, stage2.edges, video.transcript, scenes
            )

            concept_labels = [c.label for c in concepts]
            concept_embeddings = self.embedding_gateway.embed_texts(
                concept_labels, api_key=api_key
            )
            summary_texts = [n["text"] for n in hierarchy.nodes]
            summary_embeddings = (
                self.embedding_gateway.embed_texts(summary_texts, api_key=api_key)
                if summary_texts
                else []
            )
            for i, node in enumerate(hierarchy.nodes):
                if i < len(summary_embeddings):
                    node["embedding"] = summary_embeddings[i]

            self.plog_repo.save_summary_nodes(video_id, hierarchy.nodes)

            concept_rows = []
            for i, c in enumerate(concepts):
                concept_rows.append(
                    {
                        "label": c.label,
                        "node_type": c.node_type,
                        "intro_sec": float(intro.get(c.label, c.timestamp_sec or 0.0)),
                        "source_quote": c.source_quote or "",
                        "embedding": concept_embeddings[i]
                        if i < len(concept_embeddings)
                        else [],
                    }
                )
            saved_concepts = self.plog_repo.save_concepts(video_id, concept_rows)
            label_to_id = {c.label: c.id for c in saved_concepts}

            edge_rows = []
            for e in edges:
                sid = label_to_id.get(e.source_label)
                tid = label_to_id.get(e.target_label)
                if sid is None or tid is None:
                    continue
                edge_rows.append(
                    {
                        "source_id": sid,
                        "target_id": tid,
                        "edge_type": e.edge_type,
                        "quote": e.quote,
                    }
                )
            self.plog_repo.save_edges(video_id, edge_rows)

            lo_rows = []
            for lo in stage2.learning_objects:
                cid = label_to_id.get(lo.concept_label)
                if cid is None:
                    continue
                waypoints = []
                for wp in lo.waypoints or []:
                    waypoints.append(
                        {
                            "start_sec": float(wp.get("start_sec") or 0.0),
                            "end_sec": float(wp.get("end_sec") or 0.0),
                            "label": str(wp.get("label") or ""),
                        }
                    )
                if not waypoints and cid in label_to_id.values():
                    # keep empty; learning object can still open without waypoints
                    pass
                lo_rows.append(
                    {
                        "concept_id": cid,
                        "opening_question": lo.opening_question,
                        "hint_ladder": lo.hint_ladder,
                        "misconceptions": lo.misconceptions,
                        "canonical_order": lo.canonical_order,
                        "worked_examples": lo.worked_examples,
                        "waypoints": waypoints,
                    }
                )
            self.plog_repo.save_learning_objects(lo_rows)

            self.plog_repo.update_build_job(
                job.id,
                status="ready",
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                finished=True,
            )
            logger.info(
                "PLOG ready for video %d (%d concepts, %d edges)",
                video_id,
                len(saved_concepts),
                len(edge_rows),
            )
        except Exception as exc:
            logger.exception("PLOG build failed for video %d", video_id)
            self.plog_repo.update_build_job(
                job.id,
                status="failed",
                error_message=str(exc)[:2000],
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                finished=True,
            )
            raise
