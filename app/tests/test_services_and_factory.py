from django.test import TestCase, override_settings
from unittest.mock import patch, MagicMock
from app.vector_search_factory import VectorSearchFactory


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class FactoryTests(TestCase):
    @patch("app.vector_search_factory.os.getenv", return_value="opensearch")
    def test_factory_returns_opensearch(self, _):
        with patch("app.vector_search_factory.OpenSearchService") as svc:
            VectorSearchFactory.create_search_service(user_id=1, openai_api_key=None)
            svc.assert_called_once()

    @patch("app.vector_search_factory.os.getenv", return_value="pinecone")
    def test_factory_returns_pinecone(self, _):
        with patch("app.vector_search_factory.PineconeService") as svc:
            VectorSearchFactory.create_search_service(user_id=1, openai_api_key=None)
            svc.assert_called_once()
