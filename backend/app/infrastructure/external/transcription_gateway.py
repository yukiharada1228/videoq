"""
Infrastructure implementation of TranscriptionGateway.
Handles audio extraction, Whisper transcription, and scene splitting.
"""

import logging

from django.conf import settings

from app.domain.video.gateways import TranscriptionGateway
from app.infrastructure.transcription.audio_processing import extract_and_split_audio
from app.infrastructure.transcription.srt_processing import (
    apply_scene_splitting,
    transcribe_and_create_srt,
)
from app.infrastructure.transcription.video_file_accessor import DjangoVideoFileAccessor

logger = logging.getLogger(__name__)


class WhisperTranscriptionGateway(TranscriptionGateway):
    """Implements TranscriptionGateway using Whisper API and ffmpeg."""

    def __init__(self, video_file_accessor=None):
        self._video_file_accessor = video_file_accessor or DjangoVideoFileAccessor()

    def run(self, video_id: int) -> str:
        from app.infrastructure.common.task_helpers import TemporaryFileManager
        from app.infrastructure.common.whisper_client import (
            WhisperConfig,
            create_whisper_client,
            get_whisper_model_name,
        )

        with TemporaryFileManager() as temp_manager:
            video_file_path = self._video_file_accessor.get_local_path(
                video_id, temp_manager
            )

            api_key = settings.OPENAI_API_KEY
            whisper_config = WhisperConfig()
            client = create_whisper_client(api_key, whisper_config)
            whisper_model = get_whisper_model_name(whisper_config)
            logger.info(
                "Using Whisper backend: %s, model: %s",
                whisper_config.backend,
                whisper_model,
            )

            audio_segments = extract_and_split_audio(
                video_file_path, temp_manager=temp_manager
            )
            if not audio_segments:
                raise RuntimeError("Failed to extract audio from video")

            srt_content = transcribe_and_create_srt(client, audio_segments, whisper_model)
            if not srt_content:
                raise RuntimeError("Failed to transcribe any audio segments")

            logger.info("Applying scene splitting...")
            scene_split_srt, _ = apply_scene_splitting(
                srt_content, api_key, len(audio_segments)
            )

        return scene_split_srt
