"""Tests for session-scoped (ephemeral) learner state store."""

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from app.domain.plog.entities import PlogConceptEntity, PlogGraphSnapshot
from app.infrastructure.external.plog.learner_state_store import (
    EphemeralLearnerStateStore,
    build_learner_state_store,
)


class _FakePlogRepo:
    def __init__(self):
        self.upserts = []

    def get_learner_state(self, user_id, concept_id):
        return None

    def list_learner_states_for_video(self, user_id, video_id):
        return []

    def upsert_learner_state(self, user_id, concept_id, **kwargs):
        self.upserts.append((user_id, concept_id, kwargs))
        from app.domain.plog.entities import LearnerConceptStateEntity

        return LearnerConceptStateEntity(
            id=1,
            user_id=user_id,
            concept_id=concept_id,
            reached=bool(kwargs.get("reached")),
            hint_index=int(kwargs.get("hint_index") or 0),
            last_grade=str(kwargs.get("last_grade") or ""),
            active=bool(kwargs.get("active")),
        )


def _graph(video_id: int = 1) -> PlogGraphSnapshot:
    return PlogGraphSnapshot(
        video_id=video_id,
        concepts=[
            PlogConceptEntity(
                id=10,
                video_id=video_id,
                label="A",
                node_type="concept",
                intro_sec=0.0,
            ),
            PlogConceptEntity(
                id=11,
                video_id=video_id,
                label="B",
                node_type="concept",
                intro_sec=1.0,
            ),
        ],
        edges=[],
        learning_objects={},
        summary_nodes=[],
        build_status="ready",
    )


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "plog-ephemeral-tests",
        }
    }
)
class EphemeralLearnerStateStoreTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_upsert_and_list_roundtrip(self):
        store = EphemeralLearnerStateStore("sess-1", {10: 1, 11: 1})
        store.upsert(10, active=True, hint_index=2, last_grade="partial")
        states = store.list_for_video(1)
        self.assertEqual(len(states), 1)
        self.assertEqual(states[0].concept_id, 10)
        self.assertEqual(states[0].hint_index, 2)
        self.assertTrue(states[0].active)

        again = EphemeralLearnerStateStore("sess-1", {10: 1, 11: 1})
        loaded = again.get(10)
        self.assertIsNotNone(loaded)
        assert loaded is not None
        self.assertEqual(loaded.hint_index, 2)

    def test_sessions_are_isolated(self):
        a = EphemeralLearnerStateStore("sess-a", {10: 1})
        b = EphemeralLearnerStateStore("sess-b", {10: 1})
        a.upsert(10, reached=True)
        self.assertIsNone(b.get(10))

    def test_build_never_uses_db_even_when_persist_true(self):
        repo = _FakePlogRepo()
        store = build_learner_state_store(
            plog_repo=repo,
            user_id=99,
            persist=True,
            session_key="sess",
            graphs=[_graph()],
        )
        self.assertIsInstance(store, EphemeralLearnerStateStore)
        store.upsert(10, active=True, reached=True)
        self.assertEqual(repo.upserts, [])
