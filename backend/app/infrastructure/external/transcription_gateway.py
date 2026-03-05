"""
Infrastructure implementation of TranscriptionGateway.
Handles video download, audio extraction, Whisper transcription, and scene splitting.
"""

import logging
import os
import tempfile

from django.conf import settings

from app.domain.video.gateways import TranscriptionGateway

logger = logging.getLogger(__name__)


class WhisperTranscriptionGateway(TranscriptionGateway):
    """Implements TranscriptionGateway using Whisper API and ffmpeg."""

    def run(self, video_id: int) -> str:
        from app.models import Video
        from app.tasks.audio_processing import extract_and_split_audio
        from app.tasks.srt_processing import apply_scene_splitting, transcribe_and_create_srt
        from app.tasks.vector_indexing import index_scenes_batch
        from app.utils.task_helpers import TemporaryFileManager
        from app.utils.whisper_client import (
            WhisperConfig,
            create_whisper_client,
            get_whisper_model_name,
        )

        video = Video.objects.select_related("user").get(id=video_id)

        with TemporaryFileManager() as temp_manager:
            video_file_path = self._download(video, video_id, temp_manager)

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

    def _download(self, video, video_id: int, temp_manager) -> str:
        try:
            return video.file.path
        except (NotImplementedError, AttributeError):
            temp_video_path = os.path.join(
                tempfile.gettempdir(),
                f"video_{video_id}_{os.path.basename(video.file.name)}",
            )
            logger.info("Downloading video from S3 to %s", temp_video_path)
            with video.file.open("rb") as remote_file:
                with open(temp_video_path, "wb") as local_file:
                    local_file.write(remote_file.read())
            temp_manager.temp_files.append(temp_video_path)
            logger.info("Video downloaded successfully to %s", temp_video_path)
            return temp_video_path
