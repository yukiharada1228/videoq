"""Unit tests for RunTranscriptionUseCase using in-memory fakes."""

from contextlib import contextmanager
from typing import Callable, Generator, Optional
from unittest import TestCase

from app.domain.video.entities import VideoEntity
from app.domain.video.exceptions import InvalidVideoStatusTransition
from app.domain.video.status import VideoStatus
from app.use_cases.video.exceptions import (
    TranscriptionExecutionFailed,
    TranscriptionTargetMissing,
)
from app.use_cases.video.run_transcription import RunTranscriptionUseCase


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

    def run(self, video_id: int) -> str:
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


class RunTranscriptionUseCaseTests(TestCase):
    def test_success_sets_indexing_status_and_enqueues_task(self):
        video = VideoEntity(id=1, user_id=10, title="v1", status="pending")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(transcript="hello")
        task_gateway = _FakeVideoTaskGateway()
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(repo, transcription, task_gateway, tx)

        use_case.execute(video.id)

        self.assertEqual(video.status, "indexing")
        self.assertEqual(video.transcript, "hello")
        self.assertEqual(task_gateway.enqueue_indexing_calls, [video.id])

    def test_failure_sets_error_status(self):
        video = VideoEntity(id=1, user_id=10, title="v1", status="pending")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(error=RuntimeError("boom"))
        task_gateway = _FakeVideoTaskGateway()
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(repo, transcription, task_gateway, tx)

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
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(repo, transcription, task_gateway, tx)

        with self.assertRaises(TranscriptionTargetMissing):
            use_case.execute(99999)

    def test_raises_when_transition_to_processing_is_invalid(self):
        video = VideoEntity(id=1, user_id=10, title="v1", status="processing")
        repo = _FakeVideoTranscriptionRepository(video)
        transcription = _FakeTranscriptionGateway(transcript="hello")
        task_gateway = _FakeVideoTaskGateway()
        tx = _FakeTransactionPort()
        use_case = RunTranscriptionUseCase(repo, transcription, task_gateway, tx)

        with self.assertRaises(InvalidVideoStatusTransition):
            use_case.execute(video.id)
