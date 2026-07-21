"""Use case: build PLOG artifacts for a video (offline pipeline)."""

from __future__ import annotations

import logging
from typing import Optional

from app.domain.plog.gateways import (
    PlogConceptExtractor,
    PlogEmbeddingGateway,
    PlogHierarchyBuilder,
    TokenUsage,
)
from app.domain.plog.repositories import PlogRepository
from app.domain.video.repositories import VideoTranscriptionRepository
from app.infrastructure.external.plog.checks import apply_deterministic_checks
from app.infrastructure.external.plog.runtime import merge_near_duplicate_concepts
from app.infrastructure.models.plog import PlogBuildJob
from app.infrastructure.scene_otsu.parsers import SubtitleParser

logger = logging.getLogger(__name__)


class BuildPlogArtifactsUseCase:
    def __init__(
        self,
        video_repo: VideoTranscriptionRepository,
        plog_repo: PlogRepository,
        hierarchy_builder: PlogHierarchyBuilder,
        concept_extractor: PlogConceptExtractor,
        embedding_gateway: PlogEmbeddingGateway,
    ):
        self.video_repo = video_repo
        self.plog_repo = plog_repo
        self.hierarchy_builder = hierarchy_builder
        self.concept_extractor = concept_extractor
        self.embedding_gateway = embedding_gateway

    def execute(self, video_id: int, api_key: Optional[str] = None) -> None:
        video = self.video_repo.get_by_id_for_task(video_id)
        if video is None or not video.transcript:
            raise ValueError(f"Video {video_id} missing or has no transcript")

        latest = self.plog_repo.get_latest_build_job(video_id)
        if latest and latest.status in {
            PlogBuildJob.Status.PENDING,
            PlogBuildJob.Status.RUNNING,
        }:
            job = self.plog_repo.update_build_job(
                latest.id, status=PlogBuildJob.Status.RUNNING
            )
        else:
            job = self.plog_repo.create_build_job(video_id)
            job = self.plog_repo.update_build_job(
                job.id, status=PlogBuildJob.Status.RUNNING
            )
        usage = TokenUsage()

        try:
            scenes = SubtitleParser.parse_srt_scenes(video.transcript)
            # Normalize scene index field
            for i, sc in enumerate(scenes):
                sc.setdefault("index", sc.get("scene_index", i + 1))
                sc.setdefault("scene_index", sc["index"])

            # Clear previous artifacts
            self.plog_repo.delete_video_artifacts(video_id)

            # L1
            hierarchy = self.hierarchy_builder.build(scenes, api_key=api_key)
            usage = usage.add(hierarchy.usage)

            # Stage 1
            stage1 = self.concept_extractor.extract_inventory(
                video.transcript, scenes, api_key=api_key
            )
            usage = usage.add(stage1.usage)
            if not stage1.concepts:
                raise RuntimeError("Stage1 produced no concepts")

            # Paper adjudication: merge synonym / granularity twins before Stage 2.
            concepts = merge_near_duplicate_concepts(stage1.concepts)
            if len(concepts) < len(stage1.concepts):
                logger.info(
                    "PLOG merged Stage1 inventory %s -> %s concepts (synonym/granularity)",
                    len(stage1.concepts),
                    len(concepts),
                )

            # Stage 2
            stage2 = self.concept_extractor.extract_edges_and_objects(
                video.transcript, concepts, scenes, api_key=api_key
            )
            usage = usage.add(stage2.usage)

            intro, edges = apply_deterministic_checks(
                concepts, stage2.edges, video.transcript, scenes
            )

            # Embeddings for concepts + summary nodes
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
                        "intro_sec": float(intro.get(c.label, c.timestamp_sec)),
                        "source_quote": c.source_quote,
                        "embedding": concept_embeddings[i] if i < len(concept_embeddings) else [],
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
                # Resolve waypoints against scenes when possible
                waypoints = []
                for wp in lo.waypoints:
                    start = float(wp.get("start_sec") or 0.0)
                    end = float(wp.get("end_sec") or start)
                    waypoints.append(
                        {
                            "start_sec": start,
                            "end_sec": end,
                            "start_time": _sec_to_srt(start),
                            "end_time": _sec_to_srt(end),
                            "label": wp.get("label") or "",
                        }
                    )
                if not waypoints and cid in label_to_id.values():
                    # Default waypoint at intro
                    intro_sec = next(
                        (c.intro_sec for c in saved_concepts if c.id == cid), 0.0
                    )
                    waypoints.append(
                        {
                            "start_sec": intro_sec,
                            "end_sec": intro_sec + 30.0,
                            "start_time": _sec_to_srt(intro_sec),
                            "end_time": _sec_to_srt(intro_sec + 30.0),
                            "label": "introduction",
                        }
                    )
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
                status=PlogBuildJob.Status.READY,
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
                status=PlogBuildJob.Status.FAILED,
                error_message=str(exc)[:2000],
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                finished=True,
            )
            raise


def _sec_to_srt(sec: float) -> str:
    if sec < 0:
        sec = 0.0
    total_ms = int(round(sec * 1000))
    hours, rem = divmod(total_ms, 3600_000)
    minutes, rem = divmod(rem, 60_000)
    seconds, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{ms:03d}"
