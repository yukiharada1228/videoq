"""Whisper client factory for OpenAI API and local whisper.cpp server."""

import logging

from django.conf import settings
from openai import AsyncOpenAI, OpenAI

from app.infrastructure.common.provider_registry import (
    create_from_provider_registry,
    get_provider_setting,
    resolve_openai_api_key,
    validate_provider,
)

logger = logging.getLogger(__name__)


class WhisperConfig:
    """Configuration for Whisper backend selection."""

    BACKEND_OPENAI = "openai"
    BACKEND_LOCAL = "whisper.cpp"

    def __init__(self):
        provider = get_provider_setting("WHISPER_BACKEND", self.BACKEND_OPENAI)
        self.backend = validate_provider(
            "WHISPER_BACKEND",
            provider,
            (self.BACKEND_OPENAI, self.BACKEND_LOCAL),
        )
        self.local_url = getattr(
            settings, "WHISPER_LOCAL_URL", "http://host.docker.internal:8080"
        )

        logger.info("Whisper backend configured: %s", self.backend)
        if self.backend == self.BACKEND_LOCAL:
            logger.info("Local whisper server URL: %s", self.local_url)

    def is_local(self):
        return self.backend == self.BACKEND_LOCAL

    def is_openai(self):
        return self.backend == self.BACKEND_OPENAI


def create_whisper_client(api_key, config=None):
    """Create OpenAI client configured for selected Whisper backend."""
    if config is None:
        config = WhisperConfig()

    return create_from_provider_registry(
        "WHISPER_BACKEND",
        config.backend,
        {
            config.BACKEND_OPENAI: lambda: _create_openai_whisper_client(api_key),
            config.BACKEND_LOCAL: lambda: _create_local_whisper_client(api_key, config),
        },
    )


def create_async_whisper_client(api_key, config=None):
    """Create async OpenAI client configured for selected Whisper backend."""
    if config is None:
        config = WhisperConfig()

    return create_from_provider_registry(
        "WHISPER_BACKEND",
        config.backend,
        {
            config.BACKEND_OPENAI: lambda: _create_async_openai_whisper_client(api_key),
            config.BACKEND_LOCAL: lambda: _create_async_local_whisper_client(
                api_key, config
            ),
        },
    )


def get_whisper_model_name(config=None):
    """Get model name for transcription."""
    if config is None:
        config = WhisperConfig()

    return create_from_provider_registry(
        "WHISPER_BACKEND",
        config.backend,
        {
            config.BACKEND_OPENAI: lambda: "whisper-1",
            config.BACKEND_LOCAL: lambda: "whisper-local",
        },
    )


def _create_openai_whisper_client(api_key):
    logger.debug("Creating OpenAI whisper client")
    return OpenAI(api_key=resolve_openai_api_key(api_key, purpose="OpenAI Whisper"))


def _create_local_whisper_client(api_key, config):
    logger.debug("Creating local whisper client: %s", config.local_url)
    return OpenAI(
        api_key=api_key or "dummy-key-for-local",
        base_url=config.local_url,
    )


def _create_async_openai_whisper_client(api_key):
    logger.debug("Creating async OpenAI whisper client")
    return AsyncOpenAI(
        api_key=resolve_openai_api_key(api_key, purpose="OpenAI Whisper")
    )


def _create_async_local_whisper_client(api_key, config):
    logger.debug("Creating async local whisper client: %s", config.local_url)
    return AsyncOpenAI(
        api_key=api_key or "dummy-key-for-local",
        base_url=config.local_url,
    )
