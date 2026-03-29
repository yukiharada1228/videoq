from unittest import TestCase
from unittest.mock import patch

from app.infrastructure.external.youtube_transcript_gateway import YoutubeTranscriptGateway


class _FakeTransport:
    def __init__(self, responses):
        self.responses = responses
        self.calls: list[tuple[dict[str, str], str]] = []

    def __call__(self, params: dict[str, str], api_key: str):
        self.calls.append((params, api_key))
        lookup_params = {key: value for key, value in params.items() if key != "engine"}
        return self.responses.get(tuple(sorted(lookup_params.items())), {})


class YoutubeTranscriptGatewayTests(TestCase):
    @patch("app.infrastructure.external.youtube_transcript_gateway.apply_scene_splitting")
    def test_selects_transcript_without_explicit_lang(self, mock_apply_scene_splitting):
        mock_apply_scene_splitting.return_value = (
            "1\n00:00:00,000 --> 00:00:01,500\nこんにちは\n",
            1,
        )
        transport = _FakeTransport(
            {
                (
                    ("only_available", "true"),
                    ("transcript_type", "manual"),
                    ("video_id", "svm8hlhF8PA"),
                ): {
                    "transcripts": [
                        {"text": "こんにちは", "start": 0.0, "duration": 1.5},
                    ]
                }
            }
        )
        gateway = YoutubeTranscriptGateway(transport=transport)

        result = gateway.run("svm8hlhF8PA", api_key="searchapi-test-key")

        self.assertIn("こんにちは", result)
        mock_apply_scene_splitting.assert_called_once()
        self.assertEqual(
            transport.calls,
            [
                (
                    {
                        "engine": "youtube_transcripts",
                        "video_id": "svm8hlhF8PA",
                        "transcript_type": "manual",
                        "only_available": "true",
                    },
                    "searchapi-test-key",
                )
            ],
        )

    @patch("app.infrastructure.external.youtube_transcript_gateway.apply_scene_splitting")
    def test_falls_back_to_first_available_transcript(self, mock_apply_scene_splitting):
        mock_apply_scene_splitting.return_value = (
            "1\n00:00:00,000 --> 00:00:01,000\nhola\n",
            1,
        )
        transport = _FakeTransport(
            {
                (
                    ("only_available", "true"),
                    ("transcript_type", "manual"),
                    ("video_id", "abc123def45"),
                ): {
                    "transcripts": [
                        {"text": "hola", "start": 0.0, "duration": 1.0},
                    ]
                }
            }
        )
        gateway = YoutubeTranscriptGateway(transport=transport)

        result = gateway.run("abc123def45", api_key="searchapi-test-key")

        self.assertIn("hola", result)
        self.assertEqual(len(transport.calls), 1)
        self.assertEqual(transport.calls[0][0]["only_available"], "true")

    @patch("app.infrastructure.external.youtube_transcript_gateway.apply_scene_splitting")
    def test_raises_when_no_transcripts_are_available(self, _mock_apply_scene_splitting):
        transport = _FakeTransport({})
        gateway = YoutubeTranscriptGateway(transport=transport)

        with self.assertRaises(RuntimeError):
            gateway.run("abc123def45", api_key="searchapi-test-key")

    def test_raises_when_searchapi_api_key_is_missing(self):
        gateway = YoutubeTranscriptGateway(transport=_FakeTransport({}))

        with self.assertRaises(RuntimeError) as context:
            gateway.run("abc123def45")

        self.assertIn("SearchAPI API key", str(context.exception))

    @patch("app.infrastructure.external.youtube_transcript_gateway.time.sleep")
    @patch("app.infrastructure.external.youtube_transcript_gateway.urlopen")
    def test_retries_when_timeout_occurs(self, mock_urlopen, mock_sleep):
        mock_urlopen.side_effect = TimeoutError("The read operation timed out")
        gateway = YoutubeTranscriptGateway(max_retries=1)

        with self.assertRaises(RuntimeError) as context:
            gateway.run("abc123def45", api_key="searchapi-test-key")

        self.assertIn("timed out", str(context.exception))
        self.assertEqual(mock_urlopen.call_count, 2)
        mock_sleep.assert_called_once_with(1.0)
