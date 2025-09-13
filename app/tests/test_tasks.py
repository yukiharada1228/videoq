from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from app.crypto_utils import encrypt_api_key
from app.exceptions import VideoProcessingError
from app.models import Video
from app.tasks import process_video


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class TaskTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="task", email="t@example.com", password="pass"
        )

    def _create_video(self):
        return Video.objects.create(
            user=self.user,
            file=SimpleUploadedFile("a.mp4", b"data", content_type="video/mp4"),
            title="t",
            description="d",
            status="pending",
        )

    def test_process_video_without_api_key_sets_error(self):
        video = self._create_video()
        with self.assertRaises(VideoProcessingError) as context:
            process_video(video.id)
        video.refresh_from_db()
        self.assertEqual(video.status, "error")
        self.assertIn("OpenAI API key not registered", video.error_message)
        self.assertIn("OpenAI API key not registered", str(context.exception))

    @patch("app.tasks.OpenAI")
    @patch(
        "app.tasks.extract_and_split_audio",
        return_value=[{"path": "/tmp/a.mp3", "start_time": 0, "end_time": 1}],
    )
    @patch(
        "app.tasks.create_chunks_from_segments",
        return_value=[
            {"text": "hello", "start_time": 0, "end_time": 1, "chunk_index": 0}
        ],
    )
    @patch(
        "app.tasks.create_token_based_segments",
        return_value=[{"start": 0, "end": 1, "text": "hello"}],
    )
    @patch("builtins.open")
    @patch("os.path.getsize", return_value=1)
    @patch("shutil.copyfileobj")
    def test_process_video_success_minimal_flow(
        self,
        copyfileobj_mock,
        getsize_mock,
        open_mock,
        segs_mock,
        chunks_mock,
        extract_mock,
        openai_cls_mock,
    ):
        # API key configuration
        self.user.encrypted_openai_api_key = encrypt_api_key("sk-test")
        self.user.save()

        video = self._create_video()

        # OpenAI mock: Configure to work minimally for embeddings and transcriptions
        client_instance = MagicMock()
        # embeddings
        client_instance.embeddings.create.return_value = MagicMock(
            data=[MagicMock(embedding=[0.1, 0.2, 0.3])]
        )
        # transcription
        trans = MagicMock()
        trans.text = "hello"
        trans.segments = [MagicMock(start=0.0, end=1.0, text="hello")]
        client_instance.audio.transcriptions.create.return_value = trans

        # Return str to avoid being treated as Aggregate when assigning video.transcript
        def _strip():
            return "hello"

        type(trans).text = property(lambda *_: "hello")
        openai_cls_mock.return_value = client_instance

        # VectorSearchFactory mock (avoid real connection to OpenSearch/Pinecone)
        with patch("app.tasks.VectorSearchFactory.create_search_service") as factory:
            svc = MagicMock()
            svc.features_index_name = "videoq_features"
            svc.chunks_index_name = "videoq_chunks"
            # Prepare attributes called for OpenSearch case
            svc.opensearch = MagicMock()
            factory.return_value = svc

            process_video(video.id)

        video.refresh_from_db()
        self.assertEqual(video.status, "completed")
