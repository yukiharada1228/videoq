from unittest import TestCase

from app.infrastructure.external.youtube_transcript_gateway import YoutubeTranscriptGateway


class _FakeSnippet:
    def __init__(self, text: str, start: float, duration: float):
        self.text = text
        self.start = start
        self.duration = duration


class _FakeTranscript:
    def __init__(
        self,
        *,
        language_code: str,
        snippets=None,
        is_translatable: bool = False,
        translation_languages=None,
    ):
        self.language_code = language_code
        self._snippets = snippets or []
        self.is_translatable = is_translatable
        self.translation_languages = translation_languages or []
        self.translate_calls: list[str] = []

    def fetch(self):
        return self._snippets

    def translate(self, language_code: str):
        self.translate_calls.append(language_code)
        return _FakeTranscript(
            language_code=language_code,
            snippets=self._snippets,
        )


class _FakeTranscriptList:
    def __init__(self, transcript=None, *, fallback=None, error: Exception | None = None):
        self.transcript = transcript
        self.fallback = fallback
        self.error = error
        self.find_transcript_calls: list[list[str]] = []

    def find_transcript(self, languages):
        self.find_transcript_calls.append(list(languages))
        if self.error is not None:
            raise self.error
        return self.transcript

    def __iter__(self):
        if self.fallback is None:
            return iter([])
        return iter([self.fallback])


class _FakeApi:
    def __init__(self, transcript_list):
        self.transcript_list = transcript_list
        self.list_calls: list[str] = []

    def list(self, video_id: str):
        self.list_calls.append(video_id)
        return self.transcript_list


class YoutubeTranscriptGatewayTests(TestCase):
    def test_selects_transcript_using_ja_then_en_priority(self):
        transcript = _FakeTranscript(
            language_code="ja",
            snippets=[_FakeSnippet("こんにちは", 0.0, 1.5)],
        )
        transcript_list = _FakeTranscriptList(transcript=transcript)
        api = _FakeApi(transcript_list)
        gateway = YoutubeTranscriptGateway(api_factory=lambda: api)

        result = gateway.run("svm8hlhF8PA")

        self.assertIn("こんにちは", result)
        self.assertEqual(api.list_calls, ["svm8hlhF8PA"])
        self.assertEqual(transcript_list.find_transcript_calls, [["ja", "en"]])

    def test_falls_back_to_first_available_transcript_and_translates_when_possible(self):
        fallback = _FakeTranscript(
            language_code="es",
            snippets=[_FakeSnippet("hola", 0.0, 1.0)],
            is_translatable=True,
            translation_languages=[{"language_code": "en"}],
        )
        transcript_list = _FakeTranscriptList(
            fallback=fallback,
            error=RuntimeError("preferred transcript missing"),
        )
        api = _FakeApi(transcript_list)
        gateway = YoutubeTranscriptGateway(api_factory=lambda: api)

        result = gateway.run("abc123def45")

        self.assertIn("hola", result)
        self.assertEqual(fallback.translate_calls, ["en"])

    def test_raises_when_no_transcripts_are_available(self):
        transcript_list = _FakeTranscriptList(error=RuntimeError("missing"))
        api = _FakeApi(transcript_list)
        gateway = YoutubeTranscriptGateway(api_factory=lambda: api)

        with self.assertRaises(RuntimeError):
            gateway.run("abc123def45")
