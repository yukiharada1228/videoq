"""Unit tests for EnforceVideoLimitUseCase."""

from datetime import datetime, timedelta
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.video.entities import VideoEntity
from app.use_cases.video.enforce_video_limit import EnforceVideoLimitUseCase


class EnforceVideoLimitUseCaseTests(TestCase):
    def setUp(self):
        self.video_repo = MagicMock()
        self.vector_gateway = MagicMock()
        self.use_case = EnforceVideoLimitUseCase(self.video_repo, self.vector_gateway)

    def _videos(self, count: int):
        base = datetime(2026, 1, 1)
        return [
            VideoEntity(
                id=i + 1,
                user_id=10,
                title=f"v{i}",
                status="completed",
                uploaded_at=base + timedelta(minutes=i),
            )
            for i in range(count)
        ]

    def test_noop_for_unlimited(self):
        deleted = self.use_case.execute(user_id=10, video_limit=None)

        self.assertEqual(deleted, 0)
        self.video_repo.list_for_user.assert_not_called()

    def test_noop_when_within_limit(self):
        self.video_repo.list_for_user.return_value = self._videos(2)

        deleted = self.use_case.execute(user_id=10, video_limit=3)

        self.assertEqual(deleted, 0)
        self.video_repo.delete.assert_not_called()

    def test_deletes_oldest_excess_videos(self):
        videos = self._videos(5)
        self.video_repo.list_for_user.return_value = videos

        deleted = self.use_case.execute(user_id=10, video_limit=2)

        self.assertEqual(deleted, 3)
        self.video_repo.delete.assert_any_call(videos[0])
        self.video_repo.delete.assert_any_call(videos[1])
        self.video_repo.delete.assert_any_call(videos[2])
        self.assertEqual(self.video_repo.delete.call_count, 3)
        self.assertEqual(self.vector_gateway.delete_video_vectors.call_count, 3)

    def test_vector_cleanup_failure_is_non_fatal(self):
        videos = self._videos(3)
        self.video_repo.list_for_user.return_value = videos
        self.vector_gateway.delete_video_vectors.side_effect = RuntimeError("boom")

        deleted = self.use_case.execute(user_id=10, video_limit=1)

        self.assertEqual(deleted, 2)
        self.assertEqual(self.video_repo.delete.call_count, 2)
