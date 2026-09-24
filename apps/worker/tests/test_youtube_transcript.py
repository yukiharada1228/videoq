from io import BytesIO
from unittest.mock import MagicMock
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

import pytest

from worker_python.pipeline import transcription


def test_manual_transcript_http_error_closes_before_automatic_fallback(monkeypatch):
    body = BytesIO(b"Manual transcript unavailable")
    error = HTTPError("https://example.invalid", 404, "Not Found", {}, body)
    response = BytesIO(b'{"transcripts":[{"start":0,"duration":1,"text":"Hello"}]}')

    def respond(request, **_kwargs):
        transcript_type = parse_qs(urlsplit(request.full_url).query)["transcript_type"][0]
        if transcript_type == "manual":
            raise error
        assert body.closed
        return response

    http = MagicMock(side_effect=respond)
    monkeypatch.setattr(transcription, "urlopen", http)

    assert transcription._fetch_youtube_transcript("video", "test-key") == [
        {"start": 0, "duration": 1, "text": "Hello"}
    ]
    assert http.call_count == 2
    assert response.closed


def test_http_error_reads_only_a_bounded_prefix_and_closes_each_response(monkeypatch):
    class TrackedBody(BytesIO):
        bytes_read = 0

        def read(self, size=-1):
            data = super().read(size)
            self.bytes_read += len(data)
            return data

    # Four-byte UTF-8 characters still retain the full 300-character diagnostic.
    bodies = [TrackedBody(("😀" * 10_000).encode()) for _ in range(2)]
    errors = [HTTPError("https://example.invalid", 503, "Unavailable", {}, body) for body in bodies]
    monkeypatch.setattr(transcription, "urlopen", MagicMock(side_effect=errors))

    with pytest.raises(RuntimeError) as caught:
        transcription._fetch_youtube_transcript("video", "test-key")

    assert str(caught.value) == "SearchAPI HTTP 503: " + "😀" * 300
    assert all(body.closed for body in bodies)
    assert all(body.bytes_read <= 1200 for body in bodies)


def test_http_error_body_is_closed_even_when_reading_fails(monkeypatch):
    body = BytesIO()
    monkeypatch.setattr(body, "read", MagicMock(side_effect=OSError("Read failed")))
    error = HTTPError("https://example.invalid", 503, "Unavailable", {}, body)
    monkeypatch.setattr(transcription, "urlopen", MagicMock(side_effect=error))

    with pytest.raises(OSError, match="Read failed"):
        transcription._fetch_youtube_transcript("video", "test-key")
    assert body.closed
