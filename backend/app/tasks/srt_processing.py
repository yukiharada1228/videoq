"""
SRT subtitle processing utilities
"""

import logging

from django.conf import settings

from app.scene_otsu import SceneSplitter, SubtitleParser
from app.tasks.audio_processing import process_audio_segments_parallel

logger = logging.getLogger(__name__)


def format_time_for_srt(seconds):
    """
    Convert seconds to SRT time format (HH:MM:SS,mmm)
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    whole_secs = int(secs)
    millis = int((secs - whole_secs) * 1000)
    return f"{hours:02d}:{minutes:02d}:{whole_secs:02d},{millis:03d}"


def create_srt_content(segments):
    """
    Create SRT subtitle content from segments
    """
    srt_lines = []
    for i, segment in enumerate(segments, 1):
        start_time = format_time_for_srt(segment["start"])
        end_time = format_time_for_srt(segment["end"])
        text = segment["text"].strip()

        # Format as SRT
        srt_lines.append(f"{i}")
        srt_lines.append(f"{start_time} --> {end_time}")
        srt_lines.append(text)
        srt_lines.append("")  # Separate with empty line

    return "\n".join(srt_lines)


def count_scenes(srt_content):
    """
    Count the number of scenes in an SRT file
    """
    return len(
        [
            line
            for line in srt_content.split("\n")
            if line.strip() and line.strip().isdigit()
        ]
    )


def parse_srt_scenes(srt_content):
    """
    Parse SRT scenes using SubtitleParser
    """
    return SubtitleParser.parse_srt_scenes(srt_content)


def apply_scene_splitting(srt_content, api_key, original_segment_count=None):
    """
    Apply scene splitting using Otsu method
    api_key: OpenAI API key (required)
    """
    try:
        if not api_key:
            raise ValueError("OpenAI API key is required")
        splitter = SceneSplitter(api_key=api_key)
        scene_split_srt = splitter.process(srt_content, max_tokens=512)
        scene_count = count_scenes(scene_split_srt)
        logger.info(
            f"Scene splitting completed. Original: {original_segment_count} segments, Scenes: {scene_count} scenes"
        )
        return scene_split_srt, scene_count
    except Exception as e:
        logger.warning(f"Scene splitting failed: {e}. Using original SRT content.")
        return srt_content, original_segment_count


def transcribe_and_create_srt(client, audio_segments):
    """
    Transcribe audio segments and create SRT content
    Returns: srt_content or None if failed
    """
    all_segments = process_audio_segments_parallel(client, audio_segments)

    if not all_segments:
        return None

    return create_srt_content(all_segments)
