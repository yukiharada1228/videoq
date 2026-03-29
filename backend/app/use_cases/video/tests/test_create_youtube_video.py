from contextlib import contextmanager
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.user.entities import UserEntity
from app.domain.video.entities import VideoEntity
from app.use_cases.video.create_youtube_video import CreateYoutubeVideoUseCase
from app.use_cases.video.dto import CreateYoutubeVideoInput
from app.use_cases.video.exceptions import InvalidYoutubeUrl, ResourceNotFound
from app.use_cases.video.youtube import build_youtube_embed_url, extract_youtube_video_id


class _FakeYoutubeVideoRepository:
    def __init__(self):
        self._videos = {}
        self._next_id = 1

    def create_youtube(self, user_id: int, params):
        video = VideoEntity(
            id=self._next_id,
            user_id=user_id,
            title=params.title,
            description=params.description,
            status="pending",
            source_type="youtube",
            source_url=params.source_url,
            youtube_video_id=params.youtube_video_id,
        )
        self._videos[self._next_id] = video
        self._next_id += 1
        return video


class _FakeTransactionPort:
    @contextmanager
    def atomic(self):
        yield

    def on_commit(self, fn):
        fn()


class YoutubeUrlTests(TestCase):
    def test_extracts_video_id_from_watch_url(self):
        self.assertEqual(
            extract_youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            "dQw4w9WgXcQ",
        )

    def test_extracts_video_id_from_short_url(self):
        self.assertEqual(
            extract_youtube_video_id("https://youtu.be/dQw4w9WgXcQ?t=43"),
            "dQw4w9WgXcQ",
        )

    def test_rejects_non_youtube_url(self):
        with self.assertRaises(InvalidYoutubeUrl):
            extract_youtube_video_id("https://example.com/watch?v=dQw4w9WgXcQ")

    def test_builds_embed_url(self):
        self.assertEqual(
            build_youtube_embed_url("dQw4w9WgXcQ"),
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
        )


class CreateYoutubeVideoUseCaseTests(TestCase):
    def setUp(self):
        self.user_id = 101
        self.user_repo = MagicMock()
        self.user_repo.get_by_id.return_value = UserEntity(
            id=self.user_id,
            username="user",
            email="user@example.com",
            is_active=True,
        )
        self.repo = _FakeYoutubeVideoRepository()
        self.task_queue = MagicMock()
        self.use_case = CreateYoutubeVideoUseCase(
            self.user_repo,
            self.repo,
            self.task_queue,
            _FakeTransactionPort(),
        )

    def test_creates_youtube_video_and_enqueues_transcription(self):
        video = self.use_case.execute(
            self.user_id,
            CreateYoutubeVideoInput(
                youtube_url="https://youtu.be/dQw4w9WgXcQ",
                title="Never Gonna Give You Up",
                description="desc",
            ),
        )

        self.assertEqual(video.source_type, "youtube")
        self.assertEqual(video.youtube_video_id, "dQw4w9WgXcQ")
        self.assertEqual(video.source_url, "https://youtu.be/dQw4w9WgXcQ")
        self.task_queue.enqueue_transcription.assert_called_once_with(video.id)

    def test_raises_when_user_missing(self):
        self.user_repo.get_by_id.return_value = None

        with self.assertRaises(ResourceNotFound):
            self.use_case.execute(
                self.user_id,
                CreateYoutubeVideoInput(
                    youtube_url="https://youtu.be/dQw4w9WgXcQ",
                    title="Title",
                    description="",
                ),
            )
