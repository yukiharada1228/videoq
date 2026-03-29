from __future__ import annotations

import json
import math
import socket
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings

from app.domain.video.gateways import YoutubeTranscriptionGateway
from app.infrastructure.transcription.srt_processing import apply_scene_splitting


class YoutubeTranscriptGateway(YoutubeTranscriptionGateway):
    def __init__(
        self,
        *,
        base_url: str = "https://www.searchapi.io/api/v1/search",
        timeout_seconds: int | None = None,
        max_retries: int = 1,
        transport=None,
    ):
        self.base_url = base_url
        self.timeout_seconds = timeout_seconds or getattr(
            settings, "SEARCHAPI_TIMEOUT_SECONDS", 60
        )
        self.max_retries = max_retries
        self._transport = transport

    def run(self, youtube_video_id: str, api_key=None) -> str:
        self._ensure_api_key(api_key)
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

    def estimate_duration_seconds(self, youtube_video_id: str, api_key=None) -> int | None:
        self._ensure_api_key(api_key)
        transcript = self._select_transcript(youtube_video_id, api_key)
        max_end_seconds = 0.0
        for item in transcript:
            start = float(item.get("start", 0))
            duration = float(item.get("duration", 0))
            max_end_seconds = max(max_end_seconds, start + duration)
        if max_end_seconds <= 0:
            return None
        return max(1, math.ceil(max_end_seconds))

    def _ensure_api_key(self, api_key: str | None) -> None:
        if api_key:
            return
        raise RuntimeError(
            "SearchAPI API key is not configured. Set your SearchAPI API key in Settings before importing YouTube videos."
        )

    def _select_transcript(self, youtube_video_id: str, api_key: str):
        attempts = [
            {
                "video_id": youtube_video_id,
                "transcript_type": "manual",
                "only_available": "true",
            },
            {
                "video_id": youtube_video_id,
                "transcript_type": "auto",
                "only_available": "true",
            },
        ]

        last_error: RuntimeError | None = None
        for params in attempts:
            response = self._fetch_transcript_response(params, api_key)
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

    def _fetch_transcript_response(self, params: dict[str, str], api_key: str) -> dict:
        query = {"engine": "youtube_transcripts", **params}
        if self._transport is not None:
            return self._transport(query, api_key)

        request = Request(
            f"{self.base_url}?{urlencode(query)}",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )
        attempts = self.max_retries + 1
        last_error: Exception | None = None

        for attempt in range(attempts):
            try:
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    return json.loads(response.read().decode("utf-8"))
            except HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="ignore")
                message = detail or exc.reason
                raise RuntimeError(f"SearchAPI request failed: {message}") from exc
            except (TimeoutError, socket.timeout) as exc:
                last_error = exc
            except URLError as exc:
                if isinstance(exc.reason, (TimeoutError, socket.timeout)):
                    last_error = exc
                else:
                    raise RuntimeError(f"SearchAPI request failed: {exc.reason}") from exc

            if attempt < self.max_retries:
                time.sleep(1.0)

        raise RuntimeError(
            f"SearchAPI request timed out after {attempts} attempts. "
            "Please try again in a moment."
        ) from last_error


def _format_srt_time(total_ms: int) -> str:
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"
