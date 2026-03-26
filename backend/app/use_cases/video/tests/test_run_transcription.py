"""Unit tests for RunTranscriptionUseCase using in-memory fakes."""

from contextlib import contextmanager
from typing import Callable, Generator, Optional
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.billing.exceptions import ProcessingLimitExceeded
from app.domain.video.entities import VideoEntity
from app.domain.video.exceptions import InvalidVideoStatusTransition
from app.domain.video.status import VideoStatus
from app.use_cases.video.exceptions import (
    TranscriptionExecutionFailed,
    TranscriptionTargetMissing,
)
from app.use_cases.video.run_transcription import RunTranscriptionUseCase, _parse_srt_duration_seconds


class _FakeVideoTranscriptionRepository:
    def __init__(self, video=None):
        self.video = video

    def get_by_id_for_task(self, video_id: int):
        if self.video is None or self.video.id != video_id:
            return None
        return self.video

    def transition_status(
        self,
        video_id: int,
        from_status: VideoStatus,
        to_status: VideoStatus,
        error_message: str = "",
    ) -> None:
        if self.video and self.video.id == video_id:
            if self.video.status != from_status.value:
                raise InvalidVideoStatusTransition(from_status.value, to_status.value)
            self.video.status = to_status.value
            self.video.error_message = error_message

    def save_transcript(self, video_id: int, transcript: str) -> None:
        if self.video and self.video.id == video_id:
            self.video.transcript = transcript

    def list_completed_with_transcript(self):
        return []


class _FakeTranscriptionGateway:
    def __init__(self, transcript: str = "srt text", error: Optional[Exception] = None):
        self.transcript = transcript
        self.error = error
        self.calls: list[int] = []

    def run(self, video_id: int, api_key=None) -> str:
        self.calls.append(video_id)
        if self.error:
            raise self.error
        return self.transcript


class _FakeVideoTaskGateway:
    def __init__(self) -> None:
        self.enqueue_indexing_calls: list[int] = []

    def enqueue_indexing(self, video_id: int) -> None:
        self.enqueue_indexing_calls.append(video_id)

    def enqueue_transcription(self, video_id: int) -> None:
        pass

    def enqueue_reindex_all_videos_embeddings(self) -> str:
        return ""


class _FakeTransactionPort:
    @contextmanager
    def atomic(self) -> Generator[None, None, None]:
        yield

    def on_commit(self, fn: Callable[[], None]) -> None:
        fn()


class _FakeUploadGateway:
    def __init__(self, file_size: int = 1024):
        self.file_size = file_size
        self.deleted_keys: list[str] = []

    def get_file_size(self, file_key: str) -> int:
        return self.file_size

    def delete_file(self, file_key: str) -> None:
        self.deleted_keys.append(file_key)

    def generate_upload_url(self, file_key: str, content_type: str) -> str:
        return ""



class RunTranscriptionUseCaseTests(TestCase):
    def test_success_sets_indexing_status_and_enqueues_task(self):
        video = VideoEntity(id=1, user_id=10, title="v1", status="pending")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(transcript="hello")
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway()
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(repo, transcription, task_gateway, upload_gw, tx)

        use_case.execute(video.id)

        self.assertEqual(video.status, "indexing")
        self.assertEqual(video.transcript, "hello")
        self.assertEqual(task_gateway.enqueue_indexing_calls, [video.id])

    def test_failure_sets_error_status(self):
        video = VideoEntity(id=1, user_id=10, title="v1", status="pending")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(error=RuntimeError("boom"))
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway()
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(repo, transcription, task_gateway, upload_gw, tx)

        with self.assertRaises(TranscriptionExecutionFailed) as exc:
            use_case.execute(video.id)

        self.assertEqual(video.status, "error")
        self.assertEqual(video.error_message, "boom")
        self.assertEqual(task_gateway.enqueue_indexing_calls, [])
        self.assertEqual(exc.exception.video_id, video.id)

    def test_raises_transcription_target_not_found_for_missing_video(self):
        repo = _FakeVideoTranscriptionRepository(video=None)
        transcription = _FakeTranscriptionGateway(transcript="hello")
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway()
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(repo, transcription, task_gateway, upload_gw, tx)

        with self.assertRaises(TranscriptionTargetMissing):
            use_case.execute(99999)

    def test_raises_when_transition_to_processing_is_invalid(self):
        video = VideoEntity(id=1, user_id=10, title="v1", status="processing")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(transcript="hello")
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway()
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(repo, transcription, task_gateway, upload_gw, tx)

        with self.assertRaises(InvalidVideoStatusTransition):
            use_case.execute(video.id)

    def test_records_processing_usage_after_successful_transcription(self):
        srt = "1\n00:00:00,000 --> 00:00:30,000\nHello world\n"
        video = VideoEntity(id=1, user_id=10, title="v1", status="pending")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(transcript=srt)
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway()
        tx = _FakeTransactionPort()
        mock_processing_record = MagicMock()
        use_case = RunTranscriptionUseCase(
            repo, transcription, task_gateway, upload_gw, tx,
            processing_record_use_case=mock_processing_record,
        )

        use_case.execute(video.id)

        mock_processing_record.execute.assert_called_once_with(10, 30)

    def test_skips_processing_record_when_transcription_fails(self):
        video = VideoEntity(id=1, user_id=10, title="v1", status="pending")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(error=RuntimeError("boom"))
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway()
        tx = _FakeTransactionPort()
        mock_processing_record = MagicMock()
        use_case = RunTranscriptionUseCase(
            repo, transcription, task_gateway, upload_gw, tx,
            processing_record_use_case=mock_processing_record,
        )

        with self.assertRaises(TranscriptionExecutionFailed):
            use_case.execute(video.id)

        mock_processing_record.execute.assert_not_called()

    def test_does_not_fail_transcription_when_billing_record_raises(self):
        srt = "1\n00:00:00,000 --> 00:01:00,000\nContent\n"
        video = VideoEntity(id=1, user_id=10, title="v1", status="pending")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(transcript=srt)
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway()
        tx = _FakeTransactionPort()
        mock_processing_record = MagicMock()
        mock_processing_record.execute.side_effect = RuntimeError("billing down")
        use_case = RunTranscriptionUseCase(
            repo, transcription, task_gateway, upload_gw, tx,
            processing_record_use_case=mock_processing_record,
        )

        # Should not raise
        use_case.execute(video.id)
        self.assertEqual(video.status, "indexing")

    def test_file_size_exceeded_deletes_file_and_video(self):
        from unittest.mock import MagicMock

        from app.domain.user.entities import UserEntity
        from app.use_cases.video.exceptions import FileSizeExceeded

        user = UserEntity(
            id=10, username="u", email="u@e.com",
            is_active=True, max_video_upload_size_mb=500,
        )
        user_repo = MagicMock()
        user_repo.get_by_id.return_value = user
        max_bytes = user.get_max_upload_size_bytes()

        video = VideoEntity(id=1, user_id=10, title="v1", status="pending", file_key="uploads/test.mp4")
        repo = _FakeVideoTranscriptionRepository(video)
        repo.deleted = []

        def fake_delete(v):
            repo.deleted.append(v.id)
        repo.delete = fake_delete

        transcription = _FakeTranscriptionGateway(transcript="hello")
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway(file_size=max_bytes + 1)
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(
            repo, transcription, task_gateway, upload_gw, tx, user_repo=user_repo,
        )

        with self.assertRaises(FileSizeExceeded):
            use_case.execute(video.id)

        self.assertEqual(upload_gw.deleted_keys, ["uploads/test.mp4"])
        self.assertEqual(repo.deleted, [1])
        self.assertEqual(transcription.calls, [])

    def test_processing_limit_exceeded_sets_error_and_skips_transcription(self):
        video = VideoEntity(id=1, user_id=10, title="v1", status="pending", file_key="uploads/test.mp4")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(transcript="hello")
        task_gateway = _FakeVideoTaskGateway()
        upload_gw = _FakeUploadGateway()
        tx = _FakeTransactionPort()
        mock_check = MagicMock()
        mock_check.execute.side_effect = ProcessingLimitExceeded("Processing limit exceeded")
        use_case = RunTranscriptionUseCase(
            repo,
            transcription,
            task_gateway,
            upload_gw,
            tx,
            duration_estimator=lambda _: 62,
            processing_limit_check_use_case=mock_check,
        )

        with self.assertRaises(TranscriptionExecutionFailed) as exc:
            use_case.execute(video.id)

        mock_check.execute.assert_called_once_with(10, 62)
        self.assertEqual(video.status, "error")
        self.assertEqual(transcription.calls, [])
        self.assertIn("Processing limit exceeded", str(exc.exception))


class ParseSrtDurationTests(TestCase):
    """Unit tests for the _parse_srt_duration_seconds helper."""

    def test_returns_duration_from_single_entry(self):
        srt = "1\n00:00:00,000 --> 00:00:30,500\nHello\n"
        self.assertEqual(_parse_srt_duration_seconds(srt), 30)

    def test_returns_max_end_time_across_multiple_entries(self):
        srt = (
            "1\n00:00:00,000 --> 00:00:10,000\nFirst\n\n"
            "2\n00:00:10,000 --> 00:02:05,000\nSecond\n"
        )
        self.assertEqual(_parse_srt_duration_seconds(srt), 125)

    def test_returns_none_for_empty_string(self):
        self.assertIsNone(_parse_srt_duration_seconds(""))

    def test_returns_none_for_no_timestamps(self):
        self.assertIsNone(_parse_srt_duration_seconds("some random text"))

    def test_handles_hour_level_timestamps(self):
        srt = "1\n01:30:00,000 --> 01:30:45,000\nContent\n"
        self.assertEqual(_parse_srt_duration_seconds(srt), 5445)
