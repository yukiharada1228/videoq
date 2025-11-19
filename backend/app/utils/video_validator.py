"""
Video validation utilities
"""

import json
import logging
import os
import subprocess
import tempfile

from django.conf import settings

logger = logging.getLogger(__name__)


def get_video_duration(video_file):
    """
    Get video duration in seconds using ffprobe

    Args:
        video_file: Django FileField or file-like object

    Returns:
        float: Duration in seconds, or None if unable to determine
    """
    try:
        # Get file path
        is_temp_file = False
        try:
            # Local filesystem case
            video_path = video_file.path
        except (NotImplementedError, AttributeError):
            # Remote storage like S3 case - download temporarily
            is_temp_file = True
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
            temp_path = temp_file.name
            temp_file.close()

            try:
                # Download file from remote storage
                with video_file.open("rb") as remote_file:
                    with open(temp_path, "wb") as local_file:
                        local_file.write(remote_file.read())

                video_path = temp_path
            except Exception as e:
                logger.error(f"Failed to download video file for validation: {e}")
                return None

        # Get video duration using ffprobe
        probe_result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                video_path,
            ],
            capture_output=True,
            text=True,
            check=True,
        )

        probe = json.loads(probe_result.stdout)
        duration = float(probe["format"]["duration"])

        # Clean up temporary file if created
        if is_temp_file:
            try:
                os.unlink(video_path)
            except Exception as e:
                logger.warning(f"Failed to delete temporary file {video_path}: {e}")

        return duration

    except subprocess.CalledProcessError as e:
        logger.error(f"Error running ffprobe: {e.stderr}")
        return None
    except (KeyError, ValueError, json.JSONDecodeError) as e:
        logger.error(f"Error parsing ffprobe output: {e}")
        return None
    except Exception as e:
        logger.error(f"Error getting video duration: {e}")
        return None


def validate_video_duration(video_file):
    """
    Validate that video duration does not exceed the maximum allowed duration

    Args:
        video_file: Django FileField or file-like object

    Returns:
        tuple: (is_valid: bool, error_message: str or None)
    """
    duration = get_video_duration(video_file)

    if duration is None:
        # If we can't determine duration, allow upload (will fail later in processing)
        logger.warning("Could not determine video duration, skipping duration validation")
        return True, None

    max_duration = getattr(settings, "MAX_VIDEO_DURATION_SECONDS", 7200)  # Default 120 minutes

    if duration > max_duration:
        max_minutes = max_duration / 60
        duration_minutes = duration / 60
        return False, f"Video duration exceeds the limit. Maximum {max_minutes:.0f} minutes allowed, but this video is {duration_minutes:.1f} minutes."

    return True, None

