"""Whisper client factory for OpenAI API and local whisper.cpp server."""

import logging
import os

from openai import AsyncOpenAI, OpenAI

logger = logging.getLogger(__name__)


class WhisperConfig:
    """Configuration for Whisper backend selection."""

    BACKEND_OPENAI = "openai"
    BACKEND_LOCAL = "whisper.cpp"

    def __init__(self):
        self.backend = os.getenv("WHISPER_BACKEND", self.BACKEND_OPENAI).lower()
        self.local_url = os.getenv(
            "WHISPER_LOCAL_URL", "http://host.docker.internal:8080"
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

    if config.is_local():
        logger.debug("Creating local whisper client: %s", config.local_url)
        return OpenAI(
            api_key=api_key or "dummy-key-for-local",
            base_url=config.local_url,
        )

    logger.debug("Creating OpenAI whisper client")
    return OpenAI(api_key=api_key)


def create_async_whisper_client(api_key, config=None):
    """Create async OpenAI client configured for selected Whisper backend."""
    if config is None:
        config = WhisperConfig()

    if config.is_local():
        logger.debug("Creating async local whisper client: %s", config.local_url)
        return AsyncOpenAI(
            api_key=api_key or "dummy-key-for-local",
            base_url=config.local_url,
        )

    logger.debug("Creating async OpenAI whisper client")
    return AsyncOpenAI(api_key=api_key)


def get_whisper_model_name(config=None):
    """Get model name for transcription."""
    if config is None:
        config = WhisperConfig()

    if config.is_local():
        return "whisper-local"
    return "whisper-1"
