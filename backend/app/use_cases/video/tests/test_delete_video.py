"""Unit tests for DeleteVideoUseCase."""

from contextlib import contextmanager
from typing import Callable
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.video.entities import VideoEntity
from app.use_cases.video.delete_video import DeleteVideoUseCase
from app.use_cases.video.exceptions import ResourceNotFound


class _FakeTransactionPort:
    @contextmanager
    def atomic(self):
        yield

    def on_commit(self, fn: Callable[[], None]) -> None:
        fn()


class DeleteVideoUseCaseTests(TestCase):
    def setUp(self):
        self.video_repo = MagicMock()
        self.vector_gateway = MagicMock()
        self.use_case = DeleteVideoUseCase(
            self.video_repo,
            self.vector_gateway,
            _FakeTransactionPort(),
        )

    def test_raises_when_video_not_found(self):
        self.video_repo.get_by_id.return_value = None

        with self.assertRaises(ResourceNotFound):
            self.use_case.execute(video_id=1, user_id=10)

    def test_deletes_video_and_vectors(self):
        video = VideoEntity(id=7, user_id=10, title="t", status="pending")
        self.video_repo.get_by_id.return_value = video

        self.use_case.execute(video_id=7, user_id=10)

        self.video_repo.delete.assert_called_once_with(video)
        self.vector_gateway.delete_video_vectors.assert_called_once_with(7)

    def test_vector_cleanup_failure_does_not_break_deletion(self):
        video = VideoEntity(id=7, user_id=10, title="t", status="pending")
        self.video_repo.get_by_id.return_value = video
        self.vector_gateway.delete_video_vectors.side_effect = RuntimeError("boom")

        self.use_case.execute(video_id=7, user_id=10)

        self.video_repo.delete.assert_called_once_with(video)


class DeleteVideoStorageBillingTests(TestCase):
    """Tests for optional storage usage subtraction in DeleteVideoUseCase."""

    def _make_use_case(self, upload_gateway=None, storage_record_use_case=None):
        video_repo = MagicMock()
        vector_gateway = MagicMock()
        return (
            video_repo,
            DeleteVideoUseCase(
                video_repo,
                vector_gateway,
                _FakeTransactionPort(),
                upload_gateway=upload_gateway,
                storage_record_use_case=storage_record_use_case,
            ),
        )

    def test_subtracts_storage_on_deletion(self):
        video = VideoEntity(id=5, user_id=20, title="v", status="completed", file_key="videos/5.mp4")
        upload_gateway = MagicMock()
        upload_gateway.get_file_size.return_value = 2048
        storage_record = MagicMock()

        video_repo, use_case = self._make_use_case(
            upload_gateway=upload_gateway,
            storage_record_use_case=storage_record,
        )
        video_repo.get_by_id.return_value = video

        use_case.execute(video_id=5, user_id=20)

        upload_gateway.get_file_size.assert_called_once_with("videos/5.mp4")
        storage_record.execute.assert_called_once_with(20, -2048)

    def test_skips_billing_when_no_use_case_injected(self):
        video = VideoEntity(id=5, user_id=20, title="v", status="completed", file_key="videos/5.mp4")
        upload_gateway = MagicMock()
        upload_gateway.get_file_size.return_value = 2048

        video_repo, use_case = self._make_use_case(
            upload_gateway=upload_gateway,
            storage_record_use_case=None,
        )
        video_repo.get_by_id.return_value = video
        # Should not raise
        use_case.execute(video_id=5, user_id=20)
        upload_gateway.get_file_size.assert_not_called()

    def test_skips_billing_when_no_file_key(self):
        video = VideoEntity(id=5, user_id=20, title="v", status="completed", file_key=None)
        upload_gateway = MagicMock()
        storage_record = MagicMock()

        video_repo, use_case = self._make_use_case(
            upload_gateway=upload_gateway,
            storage_record_use_case=storage_record,
        )
        video_repo.get_by_id.return_value = video
        use_case.execute(video_id=5, user_id=20)
        storage_record.execute.assert_not_called()

    def test_does_not_fail_deletion_when_get_file_size_raises(self):
        video = VideoEntity(id=5, user_id=20, title="v", status="completed", file_key="videos/5.mp4")
        upload_gateway = MagicMock()
        upload_gateway.get_file_size.side_effect = RuntimeError("storage error")
        storage_record = MagicMock()

        video_repo, use_case = self._make_use_case(
            upload_gateway=upload_gateway,
            storage_record_use_case=storage_record,
        )
        video_repo.get_by_id.return_value = video
        # Deletion should succeed, billing not recorded
        use_case.execute(video_id=5, user_id=20)
        video_repo.delete.assert_called_once_with(video)
        storage_record.execute.assert_not_called()

    def test_does_not_fail_deletion_when_billing_record_raises(self):
        video = VideoEntity(id=5, user_id=20, title="v", status="completed", file_key="videos/5.mp4")
        upload_gateway = MagicMock()
        upload_gateway.get_file_size.return_value = 2048
        storage_record = MagicMock()
        storage_record.execute.side_effect = RuntimeError("billing down")

        video_repo, use_case = self._make_use_case(
            upload_gateway=upload_gateway,
            storage_record_use_case=storage_record,
        )
        video_repo.get_by_id.return_value = video
        # Deletion should succeed even if billing fails
        use_case.execute(video_id=5, user_id=20)
        video_repo.delete.assert_called_once_with(video)


class DeleteVideoOverQuotaClearTests(TestCase):
    """Tests for over-quota flag clearing after video deletion."""

    def _make_use_case(self, upload_gateway=None, storage_record_use_case=None, over_quota_clear_use_case=None):
        video_repo = MagicMock()
        vector_gateway = MagicMock()
        return (
            video_repo,
            DeleteVideoUseCase(
                video_repo,
                vector_gateway,
                _FakeTransactionPort(),
                upload_gateway=upload_gateway,
                storage_record_use_case=storage_record_use_case,
                over_quota_clear_use_case=over_quota_clear_use_case,
            ),
        )

    def test_clears_over_quota_flag_after_deletion(self):
        video = VideoEntity(id=5, user_id=20, title="v", status="completed", file_key="videos/5.mp4")
        over_quota_clear = MagicMock()

        video_repo, use_case = self._make_use_case(over_quota_clear_use_case=over_quota_clear)
        video_repo.get_by_id.return_value = video

        use_case.execute(video_id=5, user_id=20)

        over_quota_clear.execute.assert_called_once_with(20)

    def test_skips_over_quota_clear_when_not_injected(self):
        video = VideoEntity(id=5, user_id=20, title="v", status="completed")

        video_repo, use_case = self._make_use_case(over_quota_clear_use_case=None)
        video_repo.get_by_id.return_value = video

        # Should not raise
        use_case.execute(video_id=5, user_id=20)

    def test_does_not_fail_deletion_when_over_quota_clear_raises(self):
        video = VideoEntity(id=5, user_id=20, title="v", status="completed")
        over_quota_clear = MagicMock()
        over_quota_clear.execute.side_effect = RuntimeError("quota clear failed")

        video_repo, use_case = self._make_use_case(over_quota_clear_use_case=over_quota_clear)
        video_repo.get_by_id.return_value = video

        # Deletion should succeed even if quota clear fails
        use_case.execute(video_id=5, user_id=20)
        video_repo.delete.assert_called_once_with(video)
