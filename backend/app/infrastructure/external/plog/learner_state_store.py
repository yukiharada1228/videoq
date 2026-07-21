"""Session-scoped learner concept state for study mode (paper: dialogue history H).

Progress is kept only in Django cache for the browser study session. There is no
durable DB write of learner progress — matching Algorithm 1's use of H rather
than a persistent learner model.
"""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Protocol, Sequence

from django.core.cache import cache

from app.domain.plog.entities import LearnerConceptStateEntity
from app.domain.plog.repositories import PlogRepository

_EPHEMERAL_TTL_SEC = 12 * 60 * 60  # 12 hours
_EPHEMERAL_KEY_PREFIX = "plog:study:ephemeral:"


@dataclass
class _StateRecord:
    concept_id: int
    reached: bool = False
    hint_index: int = 0
    last_grade: str = ""
    active: bool = False

    def to_entity(self, *, user_id: int = 0) -> LearnerConceptStateEntity:
        return LearnerConceptStateEntity(
            id=0,
            user_id=user_id,
            concept_id=self.concept_id,
            reached=self.reached,
            hint_index=self.hint_index,
            last_grade=self.last_grade,
            active=self.active,
        )


class LearnerStateStore(Protocol):
    def get(self, concept_id: int) -> Optional[LearnerConceptStateEntity]:
        ...

    def list_for_video(self, video_id: int) -> List[LearnerConceptStateEntity]:
        ...

    def upsert(
        self,
        concept_id: int,
        *,
        reached: Optional[bool] = None,
        hint_index: Optional[int] = None,
        last_grade: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> LearnerConceptStateEntity:
        ...


class EphemeralLearnerStateStore:
    """Session-scoped progress in Django cache (no DB writes)."""

    def __init__(self, session_key: str, concept_video_ids: Dict[int, int]):
        self._cache_key = f"{_EPHEMERAL_KEY_PREFIX}{session_key}"
        self._concept_video_ids = concept_video_ids
        self._states: Dict[int, _StateRecord] = self._load()

    def _load(self) -> Dict[int, _StateRecord]:
        raw = cache.get(self._cache_key) or {}
        states: Dict[int, _StateRecord] = {}
        for key, value in raw.items():
            try:
                concept_id = int(key)
            except (TypeError, ValueError):
                continue
            if not isinstance(value, dict):
                continue
            states[concept_id] = _StateRecord(
                concept_id=concept_id,
                reached=bool(value.get("reached", False)),
                hint_index=int(value.get("hint_index") or 0),
                last_grade=str(value.get("last_grade") or ""),
                active=bool(value.get("active", False)),
            )
        return states

    def _save(self) -> None:
        payload = {
            str(concept_id): asdict(record) for concept_id, record in self._states.items()
        }
        cache.set(self._cache_key, payload, timeout=_EPHEMERAL_TTL_SEC)

    def get(self, concept_id: int) -> Optional[LearnerConceptStateEntity]:
        record = self._states.get(concept_id)
        return record.to_entity() if record else None

    def list_for_video(self, video_id: int) -> List[LearnerConceptStateEntity]:
        out: List[LearnerConceptStateEntity] = []
        for concept_id, record in self._states.items():
            if self._concept_video_ids.get(concept_id) == video_id:
                out.append(record.to_entity())
        return out

    def upsert(
        self,
        concept_id: int,
        *,
        reached: Optional[bool] = None,
        hint_index: Optional[int] = None,
        last_grade: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> LearnerConceptStateEntity:
        record = self._states.get(concept_id) or _StateRecord(concept_id=concept_id)
        if reached is not None:
            record.reached = reached
        if hint_index is not None:
            record.hint_index = hint_index
        if last_grade is not None:
            record.last_grade = last_grade
        if active is not None:
            record.active = active
        self._states[concept_id] = record
        self._save()
        return record.to_entity()


def build_learner_state_store(
    *,
    plog_repo: PlogRepository,
    user_id: int,
    persist: bool = False,
    session_key: Optional[str],
    graphs: Sequence,
) -> LearnerStateStore:
    """Always session-scoped. ``persist`` / ``user_id`` / ``plog_repo`` are ignored."""
    del plog_repo, user_id, persist
    key = session_key or f"oneshot:{uuid.uuid4()}"
    concept_video_ids: Dict[int, int] = {}
    for graph in graphs:
        for concept in graph.concepts:
            concept_video_ids[concept.id] = graph.video_id
    return EphemeralLearnerStateStore(key, concept_video_ids)
