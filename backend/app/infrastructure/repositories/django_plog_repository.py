"""Django ORM repository for PLOG artifacts."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, List, Optional, Sequence

from django.db import IntegrityError, transaction

from app.domain.plog.entities import (
    LearnerConceptStateEntity,
    PlogBuildJobEntity,
    PlogConceptEntity,
    PlogEdgeEntity,
    PlogGraphSnapshot,
    PlogLearningObjectEntity,
    PlogSummaryNodeEntity,
)
from app.domain.plog.repositories import PlogRepository
from app.infrastructure.models.plog import (
    LearnerConceptState,
    PlogBuildJob,
    PlogConcept,
    PlogEdge,
    PlogLearningObject,
    PlogSummaryNode,
)


def _stable_key(item: Any) -> str:
    try:
        return json.dumps(item, sort_keys=True, ensure_ascii=False)
    except TypeError:
        return str(item)


def _job_entity(job: PlogBuildJob) -> PlogBuildJobEntity:
    return PlogBuildJobEntity(
        id=job.id,
        video_id=job.video_id,
        status=job.status,
        error_message=job.error_message or "",
        input_tokens=job.input_tokens,
        output_tokens=job.output_tokens,
    )


def _concept_entity(c: PlogConcept) -> PlogConceptEntity:
    return PlogConceptEntity(
        id=c.id,
        video_id=c.video_id,
        label=c.label,
        node_type=c.node_type,
        intro_sec=c.intro_sec,
        source_quote=c.source_quote or "",
        embedding=list(c.embedding or []),
    )


def _edge_entity(e: PlogEdge) -> PlogEdgeEntity:
    return PlogEdgeEntity(
        id=e.id,
        video_id=e.video_id,
        source_id=e.source_id,
        target_id=e.target_id,
        edge_type=e.edge_type,
        quote=e.quote or "",
        validation_status=e.validation_status,
    )


def _lo_entity(lo: PlogLearningObject) -> PlogLearningObjectEntity:
    return PlogLearningObjectEntity(
        id=lo.id,
        concept_id=lo.concept_id,
        opening_question=lo.opening_question or "",
        hint_ladder=list(lo.hint_ladder or []),
        misconceptions=list(lo.misconceptions or []),
        canonical_order=list(lo.canonical_order or []),
        worked_examples=list(lo.worked_examples or []),
        waypoints=list(lo.waypoints or []),
    )


def _summary_entity(n: PlogSummaryNode) -> PlogSummaryNodeEntity:
    return PlogSummaryNodeEntity(
        id=n.id,
        video_id=n.video_id,
        parent_id=n.parent_id,
        level=n.level,
        text=n.text,
        start_sec=n.start_sec,
        end_sec=n.end_sec,
        scene_indices=list(n.scene_indices or []),
        embedding=list(n.embedding or []),
    )


def _state_entity(s: LearnerConceptState) -> LearnerConceptStateEntity:
    return LearnerConceptStateEntity(
        id=s.id,
        user_id=s.user_id,
        concept_id=s.concept_id,
        reached=s.reached,
        hint_index=s.hint_index,
        last_grade=s.last_grade or "",
        active=s.active,
    )


class DjangoPlogRepository(PlogRepository):
    def get_latest_build_job(self, video_id: int) -> Optional[PlogBuildJobEntity]:
        job = (
            PlogBuildJob.objects.filter(video_id=video_id)
            .order_by("-created_at")
            .first()
        )
        return _job_entity(job) if job else None

    def create_build_job(self, video_id: int) -> PlogBuildJobEntity:
        job = PlogBuildJob.objects.create(video_id=video_id, status=PlogBuildJob.Status.PENDING)
        return _job_entity(job)

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
        job = PlogBuildJob.objects.get(pk=job_id)
        if status is not None:
            job.status = status
        if error_message is not None:
            job.error_message = error_message
        if input_tokens is not None:
            job.input_tokens = input_tokens
        if output_tokens is not None:
            job.output_tokens = output_tokens
        if finished:
            job.finished_at = datetime.now(timezone.utc)
        job.save()
        return _job_entity(job)

    @transaction.atomic
    def delete_video_artifacts(self, video_id: int) -> None:
        PlogLearningObject.objects.filter(concept__video_id=video_id).delete()
        PlogEdge.objects.filter(video_id=video_id).delete()
        PlogConcept.objects.filter(video_id=video_id).delete()
        PlogSummaryNode.objects.filter(video_id=video_id).delete()

    @transaction.atomic
    def save_summary_nodes(
        self, video_id: int, nodes: Sequence[dict]
    ) -> List[PlogSummaryNodeEntity]:
        """Save nodes bottom-up. Each dict may include temp_id / parent_temp_id."""
        PlogSummaryNode.objects.filter(video_id=video_id).delete()
        created: dict[str, PlogSummaryNode] = {}
        # Sort by level ascending so parents exist first
        ordered = sorted(nodes, key=lambda n: int(n.get("level", 0)))
        for node in ordered:
            temp_id = str(node.get("temp_id", ""))
            parent_temp = node.get("parent_temp_id")
            parent = created.get(str(parent_temp)) if parent_temp is not None else None
            obj = PlogSummaryNode.objects.create(
                video_id=video_id,
                parent=parent,
                level=int(node.get("level", 0)),
                text=str(node.get("text", "")),
                start_sec=float(node.get("start_sec", 0.0)),
                end_sec=float(node.get("end_sec", 0.0)),
                scene_indices=list(node.get("scene_indices") or []),
                embedding=list(node.get("embedding") or []),
            )
            if temp_id:
                created[temp_id] = obj
        return [_summary_entity(n) for n in PlogSummaryNode.objects.filter(video_id=video_id)]

    @transaction.atomic
    def save_concepts(
        self, video_id: int, concepts: Sequence[dict]
    ) -> List[PlogConceptEntity]:
        PlogConcept.objects.filter(video_id=video_id).delete()
        objs = [
            PlogConcept(
                video_id=video_id,
                label=str(c["label"])[:255],
                node_type=str(c.get("node_type") or PlogConcept.NodeType.OBJECT),
                intro_sec=float(c.get("intro_sec", 0.0)),
                source_quote=str(c.get("source_quote") or ""),
                embedding=list(c.get("embedding") or []),
            )
            for c in concepts
        ]
        PlogConcept.objects.bulk_create(objs)
        return [
            _concept_entity(c)
            for c in PlogConcept.objects.filter(video_id=video_id).order_by("intro_sec", "id")
        ]

    @transaction.atomic
    def save_edges(self, video_id: int, edges: Sequence[dict]) -> List[PlogEdgeEntity]:
        PlogEdge.objects.filter(video_id=video_id).delete()
        objs = [
            PlogEdge(
                video_id=video_id,
                source_id=int(e["source_id"]),
                target_id=int(e["target_id"]),
                edge_type=str(e["edge_type"]),
                quote=str(e.get("quote") or ""),
                validation_status=str(
                    e.get("validation_status") or PlogEdge.ValidationStatus.VALIDATED
                ),
            )
            for e in edges
        ]
        PlogEdge.objects.bulk_create(objs)
        return [_edge_entity(e) for e in PlogEdge.objects.filter(video_id=video_id)]

    @transaction.atomic
    def save_learning_objects(
        self, objects: Sequence[dict]
    ) -> List[PlogLearningObjectEntity]:
        concept_ids = [int(o["concept_id"]) for o in objects]
        PlogLearningObject.objects.filter(concept_id__in=concept_ids).delete()
        objs = [
            PlogLearningObject(
                concept_id=int(o["concept_id"]),
                opening_question=str(o.get("opening_question") or ""),
                hint_ladder=list(o.get("hint_ladder") or []),
                misconceptions=list(o.get("misconceptions") or []),
                canonical_order=list(o.get("canonical_order") or []),
                worked_examples=list(o.get("worked_examples") or []),
                waypoints=list(o.get("waypoints") or []),
            )
            for o in objects
        ]
        PlogLearningObject.objects.bulk_create(objs)
        return [
            _lo_entity(lo)
            for lo in PlogLearningObject.objects.filter(concept_id__in=concept_ids)
        ]

    def get_graph(self, video_id: int) -> Optional[PlogGraphSnapshot]:
        job = self.get_latest_build_job(video_id)
        if job is None:
            return None
        concepts = [
            _concept_entity(c)
            for c in PlogConcept.objects.filter(video_id=video_id).order_by("intro_sec", "id")
        ]
        edges = [_edge_entity(e) for e in PlogEdge.objects.filter(video_id=video_id)]
        los = {
            lo.concept_id: _lo_entity(lo)
            for lo in PlogLearningObject.objects.filter(concept__video_id=video_id)
        }
        summaries = [
            _summary_entity(n)
            for n in PlogSummaryNode.objects.filter(video_id=video_id).order_by(
                "level", "start_sec"
            )
        ]
        return PlogGraphSnapshot(
            video_id=video_id,
            concepts=concepts,
            edges=edges,
            learning_objects=los,
            summary_nodes=summaries,
            build_status=job.status,
        )

    def list_ready_graphs(self, video_ids: Sequence[int]) -> List[PlogGraphSnapshot]:
        ready = []
        for vid in video_ids:
            job = self.get_latest_build_job(vid)
            if job is None or job.status != PlogBuildJob.Status.READY:
                continue
            graph = self.get_graph(vid)
            if graph is not None:
                ready.append(graph)
        return ready

    def update_edge_validation(
        self, edge_id: int, video_id: int, validation_status: str
    ) -> Optional[PlogEdgeEntity]:
        return self.update_edge(
            edge_id, video_id, validation_status=validation_status
        )

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
        try:
            obj = PlogConcept.objects.create(
                video_id=video_id,
                label=str(label)[:255],
                node_type=node_type or PlogConcept.NodeType.OBJECT,
                intro_sec=float(intro_sec),
                source_quote=source_quote or "",
                embedding=list(embedding or []),
            )
        except IntegrityError as exc:
            raise ValueError("A concept with this label already exists.") from exc
        PlogLearningObject.objects.get_or_create(concept_id=obj.id)
        return _concept_entity(obj)

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
        try:
            obj = PlogConcept.objects.get(pk=concept_id, video_id=video_id)
        except PlogConcept.DoesNotExist:
            return None
        if label is not None:
            obj.label = str(label)[:255]
        if node_type is not None:
            obj.node_type = node_type
        if intro_sec is not None:
            obj.intro_sec = float(intro_sec)
        if source_quote is not None:
            obj.source_quote = source_quote
        if embedding is not None:
            obj.embedding = list(embedding)
        try:
            obj.save()
        except IntegrityError as exc:
            raise ValueError("A concept with this label already exists.") from exc
        return _concept_entity(obj)

    def delete_concept(self, concept_id: int, video_id: int) -> bool:
        deleted, _ = PlogConcept.objects.filter(pk=concept_id, video_id=video_id).delete()
        return deleted > 0

    @transaction.atomic
    def merge_concepts(
        self, video_id: int, *, survivor_id: int, absorb_id: int
    ) -> Optional[PlogConceptEntity]:
        if survivor_id == absorb_id:
            return self.get_concept(survivor_id, video_id)
        try:
            survivor = PlogConcept.objects.get(pk=survivor_id, video_id=video_id)
            absorb = PlogConcept.objects.get(pk=absorb_id, video_id=video_id)
        except PlogConcept.DoesNotExist:
            return None

        # Rewire edges pointing at / from absorb → survivor; drop self-loops & dupes.
        for edge in list(PlogEdge.objects.filter(video_id=video_id, source_id=absorb_id)):
            if edge.target_id == survivor_id:
                edge.delete()
                continue
            exists = PlogEdge.objects.filter(
                video_id=video_id,
                source_id=survivor_id,
                target_id=edge.target_id,
                edge_type=edge.edge_type,
            ).exists()
            if exists:
                edge.delete()
            else:
                edge.source_id = survivor_id
                edge.save(update_fields=["source_id"])
        for edge in list(PlogEdge.objects.filter(video_id=video_id, target_id=absorb_id)):
            if edge.source_id == survivor_id:
                edge.delete()
                continue
            exists = PlogEdge.objects.filter(
                video_id=video_id,
                source_id=edge.source_id,
                target_id=survivor_id,
                edge_type=edge.edge_type,
            ).exists()
            if exists:
                edge.delete()
            else:
                edge.target_id = survivor_id
                edge.save(update_fields=["target_id"])

        survivor_lo, _ = PlogLearningObject.objects.get_or_create(concept_id=survivor_id)
        absorb_lo = PlogLearningObject.objects.filter(concept_id=absorb_id).first()
        if absorb_lo is not None:
            if not (survivor_lo.opening_question or "").strip() and absorb_lo.opening_question:
                survivor_lo.opening_question = absorb_lo.opening_question
            for field in (
                "hint_ladder",
                "misconceptions",
                "canonical_order",
                "worked_examples",
                "waypoints",
            ):
                left = list(getattr(survivor_lo, field) or [])
                right = list(getattr(absorb_lo, field) or [])
                merged: list = []
                seen = set()
                for item in left + right:
                    key = _stable_key(item)
                    if key in seen:
                        continue
                    seen.add(key)
                    merged.append(item)
                setattr(survivor_lo, field, merged)
            survivor_lo.save()

        # Merge learner progress onto survivor when possible.
        for state in list(LearnerConceptState.objects.filter(concept_id=absorb_id)):
            existing = LearnerConceptState.objects.filter(
                user_id=state.user_id, concept_id=survivor_id
            ).first()
            if existing is None:
                state.concept_id = survivor_id
                state.save(update_fields=["concept_id"])
            else:
                existing.reached = existing.reached or state.reached
                existing.hint_index = max(existing.hint_index, state.hint_index)
                if state.active and not existing.active:
                    existing.active = True
                if state.last_grade and not existing.last_grade:
                    existing.last_grade = state.last_grade
                existing.save()
                state.delete()

        absorb.delete()
        return _concept_entity(survivor)

    def get_concept(self, concept_id: int, video_id: int) -> Optional[PlogConceptEntity]:
        try:
            return _concept_entity(PlogConcept.objects.get(pk=concept_id, video_id=video_id))
        except PlogConcept.DoesNotExist:
            return None

    def get_learning_object(
        self, concept_id: int
    ) -> Optional[PlogLearningObjectEntity]:
        try:
            return _lo_entity(PlogLearningObject.objects.get(concept_id=concept_id))
        except PlogLearningObject.DoesNotExist:
            return None

    def ensure_learning_object(self, concept_id: int) -> PlogLearningObjectEntity:
        lo, _ = PlogLearningObject.objects.get_or_create(concept_id=concept_id)
        return _lo_entity(lo)

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
        if not PlogConcept.objects.filter(pk=concept_id, video_id=video_id).exists():
            return None
        lo, _ = PlogLearningObject.objects.get_or_create(concept_id=concept_id)
        if opening_question is not None:
            lo.opening_question = opening_question
        if hint_ladder is not None:
            lo.hint_ladder = [str(h) for h in hint_ladder]
        if misconceptions is not None:
            lo.misconceptions = [str(m) for m in misconceptions]
        if canonical_order is not None:
            lo.canonical_order = [str(s) for s in canonical_order]
        if worked_examples is not None:
            lo.worked_examples = [str(w) for w in worked_examples]
        if waypoints is not None:
            lo.waypoints = list(waypoints)
        lo.save()
        return _lo_entity(lo)

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
        try:
            edge = PlogEdge.objects.create(
                video_id=video_id,
                source_id=source_id,
                target_id=target_id,
                edge_type=edge_type,
                quote=quote or "",
                validation_status=validation_status or PlogEdge.ValidationStatus.VALIDATED,
            )
        except IntegrityError as exc:
            raise ValueError("This edge already exists.") from exc
        return _edge_entity(edge)

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
        try:
            edge = PlogEdge.objects.get(pk=edge_id, video_id=video_id)
        except PlogEdge.DoesNotExist:
            return None
        if source_id is not None:
            edge.source_id = source_id
        if target_id is not None:
            edge.target_id = target_id
        if edge_type is not None:
            edge.edge_type = edge_type
        if quote is not None:
            edge.quote = quote
        if validation_status is not None:
            edge.validation_status = validation_status
        try:
            edge.save()
        except IntegrityError as exc:
            raise ValueError("This edge already exists.") from exc
        return _edge_entity(edge)

    def delete_edge(self, edge_id: int, video_id: int) -> bool:
        deleted, _ = PlogEdge.objects.filter(pk=edge_id, video_id=video_id).delete()
        return deleted > 0

    def get_edge(self, edge_id: int, video_id: int) -> Optional[PlogEdgeEntity]:
        try:
            return _edge_entity(PlogEdge.objects.get(pk=edge_id, video_id=video_id))
        except PlogEdge.DoesNotExist:
            return None

    def ensure_ready_build_job(self, video_id: int) -> PlogBuildJobEntity:
        job = self.get_latest_build_job(video_id)
        if job is not None and job.status == PlogBuildJob.Status.READY:
            return job
        if job is not None and job.status in {
            PlogBuildJob.Status.PENDING,
            PlogBuildJob.Status.RUNNING,
        }:
            raise ValueError("Cannot edit graph while a rebuild is in progress.")
        created = PlogBuildJob.objects.create(
            video_id=video_id, status=PlogBuildJob.Status.READY
        )
        return _job_entity(created)

    def get_learner_state(
        self, user_id: int, concept_id: int
    ) -> Optional[LearnerConceptStateEntity]:
        try:
            state = LearnerConceptState.objects.get(user_id=user_id, concept_id=concept_id)
        except LearnerConceptState.DoesNotExist:
            return None
        return _state_entity(state)

    def list_learner_states_for_video(
        self, user_id: int, video_id: int
    ) -> List[LearnerConceptStateEntity]:
        qs = LearnerConceptState.objects.filter(
            user_id=user_id, concept__video_id=video_id
        ).select_related("concept")
        return [_state_entity(s) for s in qs]

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
        state, _ = LearnerConceptState.objects.get_or_create(
            user_id=user_id,
            concept_id=concept_id,
        )
        if reached is not None:
            state.reached = reached
        if hint_index is not None:
            state.hint_index = hint_index
        if last_grade is not None:
            state.last_grade = last_grade
        if active is not None:
            state.active = active
        state.save()
        return _state_entity(state)

    def reset_learner_states_for_video(self, user_id: int, video_id: int) -> int:
        deleted, _ = LearnerConceptState.objects.filter(
            user_id=user_id, concept__video_id=video_id
        ).delete()
        return deleted
