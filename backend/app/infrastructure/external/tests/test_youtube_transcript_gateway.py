from unittest import TestCase
from unittest.mock import patch

from searchapi import APIConnectionError

from app.infrastructure.external.youtube_transcript_gateway import (
    YoutubeTranscriptGateway,
)


class _FakeClient:
    """Stands in for a ``searchapi.SearchApi`` client in tests."""

    def __init__(self, responses):
        self.responses = responses
        self.calls: list[dict] = []
        self.closed = False

    def search(self, engine, **params):
        call = {"engine": engine, **params}
        self.calls.append(call)
        lookup = tuple(sorted((k, v) for k, v in params.items()))
        return self.responses.get(lookup, {})

    def close(self):
        self.closed = True


def _client_factory(client):
    return lambda api_key: client


class YoutubeTranscriptGatewayTests(TestCase):
    @patch("app.infrastructure.external.youtube_transcript_gateway.apply_scene_splitting")
    def test_selects_transcript_without_explicit_lang(self, mock_apply_scene_splitting):
        mock_apply_scene_splitting.return_value = (
            "1\n00:00:00,000 --> 00:00:01,500\nこんにちは\n",
            1,
        )
        client = _FakeClient(
            {
                (
                    ("only_available", True),
                    ("transcript_type", "manual"),
                    ("video_id", "svm8hlhF8PA"),
                ): {
                    "transcripts": [
                        {"text": "こんにちは", "start": 0.0, "duration": 1.5},
                    ]
                }
            }
        )
        gateway = YoutubeTranscriptGateway(client_factory=_client_factory(client))

        result = gateway.run("svm8hlhF8PA", api_key="searchapi-test-key")

        self.assertIn("こんにちは", result)
        mock_apply_scene_splitting.assert_called_once()
        self.assertEqual(
            client.calls,
            [
                {
                    "engine": "youtube_transcripts",
                    "video_id": "svm8hlhF8PA",
                    "transcript_type": "manual",
                    "only_available": True,
                }
            ],
        )
        self.assertTrue(client.closed)

    @patch("app.infrastructure.external.youtube_transcript_gateway.apply_scene_splitting")
    def test_falls_back_to_first_available_transcript(self, mock_apply_scene_splitting):
        mock_apply_scene_splitting.return_value = (
            "1\n00:00:00,000 --> 00:00:01,000\nhola\n",
            1,
        )
        client = _FakeClient(
            {
                (
                    ("only_available", True),
                    ("transcript_type", "manual"),
                    ("video_id", "abc123def45"),
                ): {
                    "transcripts": [
                        {"text": "hola", "start": 0.0, "duration": 1.0},
                    ]
                }
            }
        )
        gateway = YoutubeTranscriptGateway(client_factory=_client_factory(client))

        result = gateway.run("abc123def45", api_key="searchapi-test-key")

        self.assertIn("hola", result)
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(client.calls[0]["only_available"], True)

    def test_estimates_duration_from_last_transcript_segment(self):
        client = _FakeClient(
            {
                (
                    ("only_available", True),
                    ("transcript_type", "manual"),
                    ("video_id", "abc123def45"),
                ): {
                    "transcripts": [
                        {"text": "first", "start": 0.0, "duration": 2.0},
                        {"text": "second", "start": 7.2, "duration": 1.1},
                    ]
                }
            }
        )
        gateway = YoutubeTranscriptGateway(client_factory=_client_factory(client))

        result = gateway.estimate_duration_seconds("abc123def45", api_key="searchapi-test-key")

        self.assertEqual(result, 9)

    @patch("app.infrastructure.external.youtube_transcript_gateway.apply_scene_splitting")
    def test_raises_when_no_transcripts_are_available(self, _mock_apply_scene_splitting):
        client = _FakeClient({})
        gateway = YoutubeTranscriptGateway(client_factory=_client_factory(client))

        with self.assertRaises(RuntimeError):
            gateway.run("abc123def45", api_key="searchapi-test-key")

    def test_raises_when_searchapi_api_key_is_missing(self):
        gateway = YoutubeTranscriptGateway(client_factory=_client_factory(_FakeClient({})))

        with self.assertRaises(RuntimeError) as context:
            gateway.run("abc123def45")

        self.assertIn("SearchAPI API key", str(context.exception))

    def test_raises_runtime_error_when_connection_fails(self):
        class _FailingClient(_FakeClient):
            def search(self, engine, **params):
                raise APIConnectionError("timed out")

        gateway = YoutubeTranscriptGateway(
            client_factory=_client_factory(_FailingClient({}))
        )

        with self.assertRaises(RuntimeError) as context:
            gateway.run("abc123def45", api_key="searchapi-test-key")

        self.assertIn("timed out", str(context.exception))
