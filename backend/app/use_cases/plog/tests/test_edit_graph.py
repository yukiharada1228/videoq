"""Unit tests for PLOG graph edit use cases."""

from __future__ import annotations

from typing import Dict, Optional, Sequence
from unittest import TestCase

from app.domain.plog.entities import (
    PlogBuildJobEntity,
    PlogConceptEntity,
    PlogEdgeEntity,
    PlogGraphSnapshot,
    PlogLearningObjectEntity,
)
from app.use_cases.plog.edit_graph import EditPlogGraphUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _FakeVideo:
    def __init__(self, id: int = 1):
        self.id = id



class _FakeVideoRepo:
    def __init__(self, video: Optional[_FakeVideo] = None):
        self.video = video or _FakeVideo(id=1)

    def get_by_id(self, video_id: int, user_id: int):
        del user_id
        return self.video if self.video and self.video.id == video_id else None


class _FakeEmbedder:
    def embed_texts(self, texts: Sequence[str], api_key: Optional[str] = None):
        del api_key
        return [[float(len(t)), 0.1, 0.2] for t in texts]


class _FakePlogRepo:
    def __init__(self):
        self._job: Optional[PlogBuildJobEntity] = PlogBuildJobEntity(
            id=1, video_id=1, status="ready"
        )
        self._concepts: Dict[int, PlogConceptEntity] = {}
        self._edges: Dict[int, PlogEdgeEntity] = {}
        self._los: Dict[int, PlogLearningObjectEntity] = {}
        self._next_c = 1
        self._next_e = 1

    def get_latest_build_job(self, video_id: int):
        return self._job if self._job and self._job.video_id == video_id else None

    def ensure_ready_build_job(self, video_id: int):
        if self._job and self._job.status in {"pending", "running"}:
            raise ValueError("Cannot edit graph while a rebuild is in progress.")
        if self._job is None or self._job.status != "ready":
            self._job = PlogBuildJobEntity(id=99, video_id=video_id, status="ready")
        return self._job

    def get_graph(self, video_id: int):
        if self._job is None:
            return None
        return PlogGraphSnapshot(
            video_id=video_id,
            concepts=list(self._concepts.values()),
            edges=list(self._edges.values()),
            learning_objects=dict(self._los),
            summary_nodes=[],
            build_status=self._job.status,
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
    ):
        cid = self._next_c
        self._next_c += 1
        concept = PlogConceptEntity(
            id=cid,
            video_id=video_id,
            label=label,
            node_type=node_type,
            intro_sec=intro_sec,
            source_quote=source_quote,
            embedding=list(embedding),
        )
        self._concepts[cid] = concept
        self._los[cid] = PlogLearningObjectEntity(id=cid, concept_id=cid)
        return concept

    def update_concept(
        self,
        concept_id: int,
        video_id: int,
        *,
        label=None,
        node_type=None,
        intro_sec=None,
        source_quote=None,
        embedding=None,
    ):
        c = self._concepts.get(concept_id)
        if c is None or c.video_id != video_id:
            return None
        if label is not None:
            c.label = label
        if node_type is not None:
            c.node_type = node_type
        if intro_sec is not None:
            c.intro_sec = intro_sec
        if source_quote is not None:
            c.source_quote = source_quote
        if embedding is not None:
            c.embedding = list(embedding)
        return c

    def delete_concept(self, concept_id: int, video_id: int) -> bool:
        c = self._concepts.get(concept_id)
        if c is None or c.video_id != video_id:
            return False
        del self._concepts[concept_id]
        self._los.pop(concept_id, None)
        self._edges = {
            eid: e
            for eid, e in self._edges.items()
            if e.source_id != concept_id and e.target_id != concept_id
        }
        return True

    def merge_concepts(self, video_id: int, *, survivor_id: int, absorb_id: int):
        if self.get_concept(survivor_id, video_id) is None:
            return None
        if self.get_concept(absorb_id, video_id) is None:
            return None
        for e in list(self._edges.values()):
            if e.video_id != video_id:
                continue
            if e.source_id == absorb_id:
                e.source_id = survivor_id
            if e.target_id == absorb_id:
                e.target_id = survivor_id
        self._edges = {
            eid: e
            for eid, e in self._edges.items()
            if e.source_id != e.target_id
        }
        absorb_lo = self._los.get(absorb_id)
        survivor_lo = self._los.setdefault(
            survivor_id, PlogLearningObjectEntity(id=survivor_id, concept_id=survivor_id)
        )
        if absorb_lo and not survivor_lo.opening_question:
            survivor_lo.opening_question = absorb_lo.opening_question
        self.delete_concept(absorb_id, video_id)
        return self._concepts[survivor_id]

    def get_concept(self, concept_id: int, video_id: int):
        c = self._concepts.get(concept_id)
        if c is None or c.video_id != video_id:
            return None
        return c

    def get_learning_object(self, concept_id: int):
        return self._los.get(concept_id)

    def update_learning_object(
        self,
        concept_id: int,
        video_id: int,
        *,
        opening_question=None,
        hint_ladder=None,
        misconceptions=None,
        canonical_order=None,
        worked_examples=None,
        waypoints=None,
    ):
        if concept_id not in self._concepts or self._concepts[concept_id].video_id != video_id:
            return None
        lo = self._los.setdefault(
            concept_id, PlogLearningObjectEntity(id=concept_id, concept_id=concept_id)
        )
        if opening_question is not None:
            lo.opening_question = opening_question
        if hint_ladder is not None:
            lo.hint_ladder = list(hint_ladder)
        if misconceptions is not None:
            lo.misconceptions = list(misconceptions)
        if canonical_order is not None:
            lo.canonical_order = list(canonical_order)
        if worked_examples is not None:
            lo.worked_examples = list(worked_examples)
        if waypoints is not None:
            lo.waypoints = list(waypoints)
        return lo

    def create_edge(
        self,
        video_id: int,
        *,
        source_id: int,
        target_id: int,
        edge_type: str,
        quote: str,
        validation_status: str = "validated",
    ):
        eid = self._next_e
        self._next_e += 1
        edge = PlogEdgeEntity(
            id=eid,
            video_id=video_id,
            source_id=source_id,
            target_id=target_id,
            edge_type=edge_type,
            quote=quote,
            validation_status=validation_status,
        )
        self._edges[eid] = edge
        return edge

    def update_edge(
        self,
        edge_id: int,
        video_id: int,
        *,
        source_id=None,
        target_id=None,
        edge_type=None,
        quote=None,
        validation_status=None,
    ):
        e = self._edges.get(edge_id)
        if e is None or e.video_id != video_id:
            return None
        if source_id is not None:
            e.source_id = source_id
        if target_id is not None:
            e.target_id = target_id
        if edge_type is not None:
            e.edge_type = edge_type
        if quote is not None:
            e.quote = quote
        if validation_status is not None:
            e.validation_status = validation_status
        return e

    def delete_edge(self, edge_id: int, video_id: int) -> bool:
        e = self._edges.get(edge_id)
        if e is None or e.video_id != video_id:
            return False
        del self._edges[edge_id]
        return True

    def get_edge(self, edge_id: int, video_id: int):
        e = self._edges.get(edge_id)
        if e is None or e.video_id != video_id:
            return None
        return e


class EditPlogGraphUseCaseTests(TestCase):
    def setUp(self):
        self.repo = _FakePlogRepo()
        self.uc = EditPlogGraphUseCase(
            plog_repo=self.repo,
            video_repo=_FakeVideoRepo(),
            embedding_gateway=_FakeEmbedder(),
        )

    def test_create_and_update_concept_with_learning_object(self):
        created = self.uc.create_concept(
            video_id=1, user_id=1, label="クロック", node_type="object", intro_sec=2.0
        )
        self.assertEqual(created["label"], "クロック")
        self.assertEqual(created["hint_ladder"], [])

        updated = self.uc.update_learning_object(
            video_id=1,
            user_id=1,
            concept_id=created["id"],
            opening_question="クロックとは？",
            hint_ladder=["弱いヒント", "強いヒント"],
        )
        self.assertEqual(updated["opening_question"], "クロックとは？")
        self.assertEqual(updated["hint_count"], 2)

        renamed = self.uc.update_concept(
            video_id=1, user_id=1, concept_id=created["id"], label="クロック信号"
        )
        self.assertEqual(renamed["label"], "クロック信号")
        self.assertEqual(self.repo._concepts[created["id"]].embedding[0], float(len("クロック信号")))

    def test_delete_concept_removes_edges(self):
        a = self.uc.create_concept(video_id=1, user_id=1, label="A")
        b = self.uc.create_concept(video_id=1, user_id=1, label="B")
        self.uc.create_edge(
            video_id=1,
            user_id=1,
            source_id=a["id"],
            target_id=b["id"],
            edge_type="builds_on",
        )
        self.assertEqual(len(self.repo._edges), 1)
        self.uc.delete_concept(video_id=1, user_id=1, concept_id=a["id"])
        self.assertNotIn(a["id"], self.repo._concepts)
        self.assertEqual(len(self.repo._edges), 0)

    def test_ordering_cycle_rejected(self):
        a = self.uc.create_concept(video_id=1, user_id=1, label="A")
        b = self.uc.create_concept(video_id=1, user_id=1, label="B")
        self.uc.create_edge(
            video_id=1,
            user_id=1,
            source_id=a["id"],
            target_id=b["id"],
            edge_type="prerequisite_of",
        )
        with self.assertRaises(ValueError):
            self.uc.create_edge(
                video_id=1,
                user_id=1,
                source_id=b["id"],
                target_id=a["id"],
                edge_type="builds_on",
            )

    def test_merge_concepts_rewires_edges(self):
        a = self.uc.create_concept(video_id=1, user_id=1, label="ゲート")
        b = self.uc.create_concept(video_id=1, user_id=1, label="論理ゲート")
        c = self.uc.create_concept(video_id=1, user_id=1, label="クロック")
        self.uc.create_edge(
            video_id=1,
            user_id=1,
            source_id=c["id"],
            target_id=b["id"],
            edge_type="builds_on",
        )
        merged = self.uc.merge_concepts(
            video_id=1, user_id=1, survivor_id=a["id"], absorb_id=b["id"]
        )
        self.assertEqual(merged["id"], a["id"])
        self.assertNotIn(b["id"], self.repo._concepts)
        self.assertEqual(list(self.repo._edges.values())[0].target_id, a["id"])

    def test_video_not_found(self):
        with self.assertRaises(ResourceNotFound):
            self.uc.create_concept(video_id=999, user_id=1, label="X")
