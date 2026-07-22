"""Tests for QA agent retrieval tools (group scope)."""

import json
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from app.infrastructure.external.qa_agent.tools import QaSceneToolkit, SceneHit
from app.infrastructure.models import Video, VideoGroup, VideoGroupMember

User = get_user_model()


class QaSceneToolkitScopeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="toolkit_user",
            email="toolkit@example.com",
            password="testpass123",
        )
        self.other = User.objects.create_user(
            username="other_user",
            email="other@example.com",
            password="testpass123",
        )
        self.video_a = Video.objects.create(
            user=self.user, title="Alpha", status="completed"
        )
        self.video_b = Video.objects.create(
            user=self.user, title="Beta", status="completed"
        )
        self.outsider = Video.objects.create(
            user=self.other, title="Outsider", status="completed"
        )
        self.group = VideoGroup.objects.create(user=self.user, name="G")
        VideoGroupMember.objects.create(group=self.group, video=self.video_a)
        VideoGroupMember.objects.create(group=self.group, video=self.video_b)

        self.toolkit = QaSceneToolkit(
            user_id=self.user.id,
            allowed_video_ids=[self.video_a.id, self.video_b.id],
        )

    def test_list_group_videos_only_returns_allowed(self):
        payload = json.loads(self.toolkit.list_group_videos())
        ids = {v["video_id"] for v in payload["videos"]}
        self.assertEqual(ids, {self.video_a.id, self.video_b.id})
        self.assertNotIn(self.outsider.id, ids)

    def test_get_video_scenes_rejects_out_of_group_video(self):
        payload = json.loads(
            self.toolkit.get_video_scenes(video_id=self.outsider.id)
        )
        self.assertEqual(payload["scenes"], [])
        self.assertEqual(payload["error"], "video_not_in_group")

    @patch("app.infrastructure.external.qa_agent.tools.PGVectorManager.create_vectorstore")
    @patch("app.infrastructure.external.qa_agent.tools.get_embeddings")
    @override_settings(QA_AGENT_SEARCH_K=5)
    def test_search_scenes_intersects_requested_ids_with_allowed(
        self, _mock_embeddings, mock_create_store
    ):
        store = MagicMock()
        store.similarity_search.return_value = [
            MagicMock(
                page_content="scene text",
                metadata={
                    "video_id": self.video_a.id,
                    "video_title": "Alpha",
                    "start_time": "00:00:01",
                    "end_time": "00:00:02",
                    "scene_index": 1,
                },
            )
        ]
        mock_create_store.return_value = store

        payload = json.loads(
            self.toolkit.search_scenes(
                query="what is alpha",
                video_ids=[self.video_a.id, self.outsider.id],
                k=3,
            )
        )

        self.assertEqual(payload["count"], 1)
        kwargs = store.similarity_search.call_args.kwargs
        self.assertEqual(kwargs["filter"]["user_id"], self.user.id)
        self.assertEqual(kwargs["filter"]["video_id"]["$in"], [self.video_a.id])
        self.assertEqual(kwargs["k"], 3)
        self.assertEqual(len(self.toolkit.collected_scenes), 1)

    @patch("app.infrastructure.external.qa_agent.tools.fetch_video_scenes")
    def test_get_video_scenes_remembers_hits(self, mock_fetch):
        mock_fetch.return_value = [
            {
                "content": "hello scene",
                "metadata": {
                    "video_title": "Alpha",
                    "start_time": "00:00:00",
                    "end_time": "00:00:05",
                    "scene_index": 1,
                },
            }
        ]
        payload = json.loads(
            self.toolkit.get_video_scenes(video_id=self.video_a.id, limit=10)
        )
        self.assertEqual(payload["count"], 1)
        self.assertEqual(self.toolkit.collected_scenes[0].page_content, "hello scene")

    def test_scene_hit_dedupe_prefers_scene_index(self):
        a = SceneHit(
            video_id=1,
            video_title="t",
            start_time="00:00:00",
            end_time="00:00:01",
            page_content="x",
            scene_index=3,
        )
        b = SceneHit(
            video_id=1,
            video_title="t",
            start_time="99:99:99",
            end_time="99:99:99",
            page_content="y",
            scene_index=3,
        )
        self.assertEqual(a.dedupe_key, b.dedupe_key)
