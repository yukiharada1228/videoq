"""Bounded speech provider boundary; the job/checkpoint pipeline stays provider-neutral."""
from __future__ import annotations

from dataclasses import dataclass, field
import logging
import json
import math
import os
from pathlib import Path
import random
import time
from typing import Any
from urllib.parse import urlsplit

import openai
from worker_python.pipeline.speech_metrics import record_speech_metric

logger = logging.getLogger(__name__)
MAX_AUDIO_BYTES = 24_000_000  # Below either provider's 25 MB multipart limit.


class TranscriptionConfigurationError(RuntimeError):
    pass


class TranscriptionProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class SpeechRoute:
    provider: str
    model: str
    url: str
    key: str = field(repr=False)


def configured_provider() -> str:
    return os.environ.get('TRANSCRIPTION_PROVIDER') or os.environ.get('WHISPER_BACKEND') or (
        'local' if os.environ.get('DEPLOYMENT_EDITION') == 'onprem' else 'groq')


def speech_route() -> SpeechRoute:
    provider = configured_provider()
    if provider not in {'groq', 'openai', 'local'}:
        raise TranscriptionConfigurationError('Unsupported transcription provider; configure groq, openai or local')
    if os.environ.get('DEPLOYMENT_EDITION') == 'onprem' and provider != 'local':
        raise TranscriptionConfigurationError('On-premises transcription requires the local provider')
    model = os.environ.get('TRANSCRIPTION_MODEL') or {'groq': 'whisper-large-v3-turbo', 'openai': 'whisper-1', 'local': 'whisper-local'}[provider]
    expected = {'groq': 'whisper-large-v3-turbo', 'openai': 'whisper-1', 'local': 'whisper-local'}[provider]
    if model != expected:
        raise TranscriptionConfigurationError('Unsupported TRANSCRIPTION_MODEL for the selected provider')
    key_name = 'GROQ_API_KEY' if provider == 'groq' else 'OPENAI_API_KEY'
    key = os.environ.get(key_name, '').strip()
    if provider != 'local' and not key:
        raise TranscriptionConfigurationError(f'{key_name} is required for the selected transcription provider')
    if provider == 'groq' and not os.environ.get('OPENAI_API_KEY', '').strip():
        raise TranscriptionConfigurationError('OPENAI_API_KEY is required for transcription fallback')
    url = {'groq': 'https://api.groq.com/openai/v1', 'openai': 'https://api.openai.com/v1',
           'local': os.environ.get('WHISPER_LOCAL_URL') or 'http://127.0.0.1:8080'}[provider]
    if provider == 'local':
        parsed = urlsplit(url)
        if (parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or parsed.hostname.rstrip('.') in {'api.openai.com', 'api.groq.com'}):
            raise TranscriptionConfigurationError('Local transcription requires a private compatible endpoint')
    return SpeechRoute(provider, model, url, key or 'local-inference')


def transient(error: Exception) -> bool:
    current: BaseException | None = error
    for _ in range(4):
        if current is None:
            break
        if any(value in str(current).lower() for value in ('certificate', 'ssl', 'tls')):
            return False
        current = current.__cause__
    status = getattr(error, 'status_code', None)
    return status in {408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529} or isinstance(error, openai.APIConnectionError)


def native_file(client: Any, audio_path: Path, model: str, *, offset: float, on_duration=None) -> list[dict]:
    if not 0 < audio_path.stat().st_size <= MAX_AUDIO_BYTES:
        raise TranscriptionProviderError('Audio must be nonempty and below the multipart upload limit')
    with audio_path.open('rb') as audio:
        response = client.audio.transcriptions.create(model=model, file=audio,
            response_format='verbose_json', timestamp_granularities=['segment'])
    duration = getattr(response, 'duration', None)
    if on_duration and isinstance(duration, (int, float)) and not isinstance(duration, bool) and math.isfinite(duration) and duration >= 0:
        on_duration(duration)
    segments = getattr(response, 'segments', None) or []
    output = []
    for segment in segments:
        fields = segment if isinstance(segment, dict) else vars(segment)
        start, end, text = fields.get('start'), fields.get('end'), fields.get('text')
        if (isinstance(start, bool) or isinstance(end, bool)
                or not isinstance(start, (int, float)) or not isinstance(end, (int, float))
                or not math.isfinite(start) or not math.isfinite(end)
                or start < 0 or end <= start or not isinstance(text, str)):
            raise TranscriptionProviderError('Whisper must return real segment timestamps and text')
        if text.strip():
            output.append({'start': start + offset, 'end': end + offset, 'text': text})
    if not output and getattr(response, 'text', '').strip():
        raise TranscriptionProviderError('Whisper must return real segment timestamps')
    return output


class TranscriptionSession:
    """One interval's attempts. No fallback results, reservations or IDs are persisted."""
    def __init__(self, route: SpeechRoute):
        self.route = route
        self.clients: dict[str, Any] = {}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        for client in self.clients.values():
            try:
                client.close()
            except Exception:
                logger.warning('transcription_client_close_failed')

    def transcribe(self, audio_path: Path, *, offset: float) -> list[dict]:
        routes = [self.route] if self.route.provider == 'local' else [self.route, self.route]
        if self.route.provider == 'groq':
            routes.append(SpeechRoute('openai', 'whisper-1', 'https://api.openai.com/v1', os.environ['OPENAI_API_KEY']))
        for index, route in enumerate(routes):
            started = time.monotonic()
            if route.provider not in self.clients:
                self.clients[route.provider] = openai.OpenAI(api_key=route.key, base_url=route.url,
                    timeout=120.0 if route.provider == 'local' else 35.0,
                    max_retries=2 if route.provider == 'local' else 0)
            client = self.clients[route.provider]
            try:
                duration = []
                result = native_file(client, audio_path, route.model, offset=offset, on_duration=duration.append)
                seconds = duration[0] if duration else None
                cost = None if seconds is None or route.provider == 'local' else (
                    max(10, seconds) * .04 / 3600 if route.provider == 'groq' else seconds * .006 / 60)
                metric = {'provider':route.provider,'model':route.model,'attempt':index+1,
                          'seconds':time.monotonic()-started,'status':'completed',
                          'audio_seconds':seconds,'estimated_cost_usd':cost}
                record_speech_metric(metric)
                logger.info('speech_provider_call %s', json.dumps(metric))
                return result
            except Exception as error:
                status = getattr(error, 'status_code', None)
                status = status if isinstance(status, int) else None
                record_speech_metric({'provider':route.provider,'model':route.model,'attempt':index+1,'seconds':time.monotonic()-started,'status':'failed','http_status':status,'estimated_cost_usd':None})
                logger.warning('speech_provider_call provider=%s attempt=%d seconds=%.3f status=failed http_status=%s',
                               route.provider, index + 1, time.monotonic() - started, status)
                if isinstance(error, TranscriptionProviderError):
                    raise
                if index == len(routes) - 1 or not transient(error):
                    # Upstream error text can echo credentials or private content.
                    raise TranscriptionProviderError(f'{route.provider} transcription request failed' +
                        (f' ({status})' if isinstance(status, int) else '')) from None
                time.sleep(random.SystemRandom().uniform(.075, .15) * 2 ** index)
        raise TranscriptionProviderError('No transcription route')


def _whisper_client():
    route = speech_route()
    return TranscriptionSession(route), route.model


def _whisper_file(client: Any, audio_path: Path, model: str, *, offset: float) -> list[dict]:
    # Native SDK acceptance tests may exercise just the wire-format decoder.
    if isinstance(client, TranscriptionSession):
        return client.transcribe(audio_path, offset=offset)
    return native_file(client, audio_path, model, offset=offset)
