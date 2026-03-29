from __future__ import annotations

from app.domain.video.gateways import YoutubeTranscriptionGateway


class YoutubeTranscriptGateway(YoutubeTranscriptionGateway):
    def __init__(
        self,
        *,
        preferred_languages: tuple[str, ...] = ("ja", "en"),
        api_factory=None,
    ):
        self.preferred_languages = preferred_languages
        self._api_factory = api_factory

    def run(self, youtube_video_id: str, api_key=None) -> str:
        del api_key

        transcript = self._select_transcript(youtube_video_id)
        blocks = []
        for index, item in enumerate(transcript, start=1):
            start_ms = int(item.start * 1000)
            end_ms = int((item.start + item.duration) * 1000)
            text = str(item.text).replace("\n", " ").strip()
            if not text:
                continue
            blocks.append(
                f"{index}\n{_format_srt_time(start_ms)} --> {_format_srt_time(end_ms)}\n{text}"
            )
        if not blocks:
            raise RuntimeError("No transcript available for this YouTube video.")
        return "\n\n".join(blocks) + "\n"

    def _build_api(self):
        if self._api_factory is not None:
            return self._api_factory()
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
        except ImportError as exc:
            raise RuntimeError("youtube-transcript-api is not installed.") from exc
        return YouTubeTranscriptApi()

    def _select_transcript(self, youtube_video_id: str):
        transcript_list = self._build_api().list(youtube_video_id)
        try:
            return transcript_list.find_transcript(list(self.preferred_languages)).fetch()
        except Exception:
            fallback = next(iter(transcript_list), None)
            if fallback is None:
                raise
            transcript = self._translate_if_possible(fallback)
            return transcript.fetch()

    def _translate_if_possible(self, transcript):
        language_code = getattr(transcript, "language_code", None)
        if language_code in self.preferred_languages:
            return transcript
        if not getattr(transcript, "is_translatable", False):
            return transcript

        available_translation_codes = {
            entry.get("language_code")
            for entry in getattr(transcript, "translation_languages", [])
            if isinstance(entry, dict)
        }
        for language in reversed(self.preferred_languages):
            if language in available_translation_codes:
                return transcript.translate(language)
        return transcript


def _format_srt_time(total_ms: int) -> str:
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"
