"""
YouTube URL processing utilities
"""

import re
from typing import Optional, Tuple
from urllib.parse import parse_qs, urlparse


def extract_youtube_video_id(url: str) -> Optional[str]:
    """
    Extract YouTube video ID from various URL formats

    Supported formats:
    - https://www.youtube.com/watch?v=VIDEO_ID
    - https://youtu.be/VIDEO_ID
    - https://www.youtube.com/embed/VIDEO_ID
    - https://youtube.com/watch?v=VIDEO_ID
    - https://m.youtube.com/watch?v=VIDEO_ID

    Args:
        url: YouTube URL

    Returns:
        Video ID if found, None otherwise
    """
    if not url:
        return None

    # Pattern for standard YouTube URLs
    patterns = [
        r"(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})",
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    # Try parsing as URL and extracting from query parameters
    try:
        parsed = urlparse(url)
        if "youtube.com" in parsed.netloc or "youtu.be" in parsed.netloc:
            if parsed.path.startswith("/watch"):
                query_params = parse_qs(parsed.query)
                if "v" in query_params:
                    video_id = query_params["v"][0]
                    if len(video_id) == 11:
                        return video_id
            elif parsed.path.startswith("/embed/"):
                video_id = parsed.path.split("/embed/")[-1].split("?")[0]
                if len(video_id) == 11:
                    return video_id
            elif "youtu.be" in parsed.netloc:
                video_id = parsed.path.lstrip("/").split("?")[0]
                if len(video_id) == 11:
                    return video_id
    except Exception:
        pass

    return None


def validate_youtube_url(url: str) -> Tuple[bool, Optional[str]]:
    """
    Validate YouTube URL format

    Args:
        url: YouTube URL to validate

    Returns:
        (is_valid, error_message)
    """
    if not url:
        return False, "YouTube URL is required"

    if not isinstance(url, str):
        return False, "YouTube URL must be a string"

    url = url.strip()
    if not url:
        return False, "YouTube URL cannot be empty"

    # Check if it's a YouTube URL
    youtube_domains = [
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "m.youtube.com",
    ]

    is_youtube_url = any(domain in url for domain in youtube_domains)
    if not is_youtube_url:
        return False, "Invalid YouTube URL format"

    # Try to extract video ID
    video_id = extract_youtube_video_id(url)
    if not video_id:
        return False, "Could not extract video ID from YouTube URL"

    return True, None


def get_youtube_embed_url(video_id: str) -> str:
    """
    Get YouTube embed URL from video ID

    Args:
        video_id: YouTube video ID

    Returns:
        YouTube embed URL
    """
    return f"https://www.youtube.com/embed/{video_id}"

