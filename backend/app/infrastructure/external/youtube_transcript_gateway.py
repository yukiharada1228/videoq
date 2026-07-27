from __future__ import annotations

import math
from typing import Any, Callable, Optional

from django.conf import settings
from searchapi import (
    APIConnectionError,
    AuthenticationError,
    SearchApi,
    SearchApiError,
)

from app.domain.video.gateways import YoutubeTranscriptionGateway
from app.infrastructure.transcription.srt_processing import apply_scene_splitting

ClientFactory = Callable[[str], Any]


class YoutubeTranscriptGateway(YoutubeTranscriptionGateway):
    def __init__(
        self,
        *,
        base_url: str = "https://www.searchapi.io/api/v1",
        timeout_seconds: int | None = None,
        max_retries: int = 1,
        client_factory: ClientFactory | None = None,
    ):
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds or getattr(
            settings, "SEARCHAPI_TIMEOUT_SECONDS", 60
        )
        self.max_retries = max_retries
        self._client_factory = client_factory

    def run(self, youtube_video_id: str, api_key: Optional[str] = None) -> str:
        transcript = self._select_transcript(youtube_video_id, api_key)
        blocks = []
        for index, item in enumerate(transcript, start=1):
            start = float(item.get("start", 0))
            duration = float(item.get("duration", 0))
            start_ms = int(start * 1000)
            end_ms = int((start + duration) * 1000)
            text = str(item.get("text", "")).replace("\n", " ").strip()
            if not text:
                continue
            blocks.append(
                f"{index}\n{_format_srt_time(start_ms)} --> {_format_srt_time(end_ms)}\n{text}"
            )
        if not blocks:
            raise RuntimeError("No transcript available for this YouTube video.")
        srt_content = "\n\n".join(blocks) + "\n"
        scene_split_srt, _ = apply_scene_splitting(
            srt_content,
            getattr(settings, "OPENAI_API_KEY", None),
            len(blocks),
        )
        return scene_split_srt

    def estimate_duration_seconds(
        self, youtube_video_id: str, api_key: Optional[str] = None
    ) -> int | None:
        transcript = self._select_transcript(youtube_video_id, api_key)
        max_end_seconds = 0.0
        for item in transcript:
            start = float(item.get("start", 0))
            duration = float(item.get("duration", 0))
            max_end_seconds = max(max_end_seconds, start + duration)
        if max_end_seconds <= 0:
            return None
        return max(1, math.ceil(max_end_seconds))

    def _select_transcript(self, youtube_video_id: str, api_key: str | None):
        self._ensure_api_key(api_key)
        attempts = [
            {
                "video_id": youtube_video_id,
                "transcript_type": "manual",
                "only_available": True,
            },
            {
                "video_id": youtube_video_id,
                "transcript_type": "auto",
                "only_available": True,
            },
        ]

        client = self._build_client(api_key)
        try:
            last_error: RuntimeError | None = None
            for params in attempts:
                response = self._search_transcripts(client, params)
                transcripts = response.get("transcripts") or []
                if transcripts:
                    return transcripts

                available_languages = response.get("available_languages") or []
                if available_languages:
                    last_error = RuntimeError(
                        "No YouTube transcript was returned. Available languages: "
                        + ", ".join(
                            str(entry.get("lang") or entry.get("name"))
                            for entry in available_languages
                            if isinstance(entry, dict)
                        )
                    )

            if last_error is not None:
                raise last_error
            raise RuntimeError("No transcript available for this YouTube video.")
        finally:
            close = getattr(client, "close", None)
            if callable(close):
                close()

    def _ensure_api_key(self, api_key: str | None) -> None:
        if api_key:
            return
        raise RuntimeError(
            "SearchAPI API key is not configured. Set your SearchAPI API key in Settings before importing YouTube videos."
        )

    def _build_client(self, api_key: str):
        if self._client_factory is not None:
            return self._client_factory(api_key)
        return SearchApi(
            api_key=api_key,
            base_url=self.base_url,
            timeout=self.timeout_seconds,
            max_retries=self.max_retries,
        )

    def _search_transcripts(self, client, params: dict[str, Any]) -> dict:
        try:
            return client.search("youtube_transcripts", **params)
        except AuthenticationError as exc:
            raise RuntimeError(
                "SearchAPI rejected the API key. Please check your SearchAPI API key in Settings."
            ) from exc
        except APIConnectionError as exc:
            raise RuntimeError(
                "SearchAPI request timed out or could not be reached. Please try again in a moment."
            ) from exc
        except SearchApiError as exc:
            raise RuntimeError(f"SearchAPI request failed: {exc}") from exc


def _format_srt_time(total_ms: int) -> str:
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"
