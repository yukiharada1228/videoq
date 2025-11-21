"""
Plan limit utilities

This module provides functions to get user-specific limits from the database.
"""

from app.models import User


def get_video_limit(user: User) -> int:
    """
    Get video limit for a user from the database.

    Args:
        user: User instance

    Returns:
        Maximum number of videos the user can keep
    """
    return user.video_limit


def get_whisper_minutes_limit(user: User) -> float:
    """
    Get Whisper processing time limit (in minutes) for a user from the database.

    Args:
        user: User instance

    Returns:
        Maximum Whisper processing time per month in minutes
    """
    return user.whisper_minutes_limit


def get_chat_limit(user: User) -> int:
    """
    Get chat count limit for a user from the database.

    Args:
        user: User instance

    Returns:
        Maximum chat count per month
    """
    return user.chat_limit

