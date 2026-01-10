"""
Whisper client factory for supporting both OpenAI API and local whisper.cpp server
"""

import logging
import os

from openai import AsyncOpenAI, OpenAI

logger = logging.getLogger(__name__)


class WhisperConfig:
    """Configuration for Whisper backend selection"""

    BACKEND_OPENAI = "openai"
    BACKEND_LOCAL = "local"

    def __init__(self):
        self.backend = os.getenv("WHISPER_BACKEND", self.BACKEND_OPENAI).lower()
        self.local_url = os.getenv(
            "WHISPER_LOCAL_URL", "http://host.docker.internal:8080"
        )

        logger.info(f"Whisper backend configured: {self.backend}")
        if self.backend == self.BACKEND_LOCAL:
            logger.info(f"Local whisper server URL: {self.local_url}")

    def is_local(self):
        """Check if using local whisper.cpp server"""
        return self.backend == self.BACKEND_LOCAL

    def is_openai(self):
        """Check if using OpenAI Whisper API"""
        return self.backend == self.BACKEND_OPENAI


def create_whisper_client(api_key, config=None):
    """
    Create OpenAI client configured for the selected Whisper backend

    Args:
        api_key: OpenAI API key (required even for local mode for compatibility)
        config: WhisperConfig instance (optional, will create if not provided)

    Returns:
        OpenAI client instance
    """
    if config is None:
        config = WhisperConfig()

    if config.is_local():
        # Use local whisper.cpp server with OpenAI-compatible API
        # Note: api_key is required by OpenAI client but not validated by whisper.cpp
        logger.debug(f"Creating local whisper client: {config.local_url}")
        return OpenAI(
            api_key=api_key
            or "dummy-key-for-local",  # whisper.cpp doesn't validate key
            base_url=config.local_url + "/v1",  # OpenAI-compatible endpoint
        )
    else:
        # Use OpenAI Whisper API
        logger.debug("Creating OpenAI whisper client")
        return OpenAI(api_key=api_key)


def create_async_whisper_client(api_key, config=None):
    """
    Create async OpenAI client configured for the selected Whisper backend

    Args:
        api_key: OpenAI API key (required even for local mode for compatibility)
        config: WhisperConfig instance (optional, will create if not provided)

    Returns:
        AsyncOpenAI client instance
    """
    if config is None:
        config = WhisperConfig()

    if config.is_local():
        # Use local whisper.cpp server with OpenAI-compatible API
        logger.debug(f"Creating async local whisper client: {config.local_url}")
        return AsyncOpenAI(
            api_key=api_key
            or "dummy-key-for-local",  # whisper.cpp doesn't validate key
            base_url=config.local_url + "/v1",  # OpenAI-compatible endpoint
        )
    else:
        # Use OpenAI Whisper API
        logger.debug("Creating async OpenAI whisper client")
        return AsyncOpenAI(api_key=api_key)


def get_whisper_model_name(config=None):
    """
    Get the appropriate model name for transcription

    Args:
        config: WhisperConfig instance (optional)

    Returns:
        str: Model name to use for transcription
    """
    if config is None:
        config = WhisperConfig()

    if config.is_local():
        # whisper.cpp server uses the model specified at startup
        # The model name in API calls is ignored by whisper.cpp
        # Return a placeholder for logging purposes
        return "whisper-local"
    else:
        # OpenAI Whisper API
        return "whisper-1"
