"""
Infrastructure helper for accessing video files (local or S3).
Isolates ORM access so TranscriptionGateway stays ORM-free.
"""

import logging
import os
import tempfile

logger = logging.getLogger(__name__)


class DjangoVideoFileAccessor:
    """Resolves a video_id to a local filesystem path, downloading from S3 if needed."""

    def get_local_path(self, video_id: int, temp_manager) -> str:
        from app.infrastructure.models import Video

        video = Video.objects.get(id=video_id)
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
