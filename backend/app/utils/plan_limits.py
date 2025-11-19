"""
Plan limit utilities

This module provides functions to get plan-specific limits for users.
"""

from typing import Any, Dict, TypedDict

from app.models import User


class PlanLimitDict(TypedDict):
    video_limit: int
    whisper_minutes_limit: float
    chat_limit: int


# Plan limit definitions
PLAN_LIMITS: Dict[Any, PlanLimitDict] = {
    User.PlanChoices.FREE: {
        "video_limit": 3,  # Maximum number of videos (all time)
        "whisper_minutes_limit": 10.0,  # Maximum Whisper processing time per month (minutes)
        "chat_limit": 100,  # Maximum chat count per month
    },
    User.PlanChoices.PRO: {
        "video_limit": 50,  # Maximum number of videos (all time)
        "whisper_minutes_limit": 1200.0,  # Maximum Whisper processing time per month (minutes)
        "chat_limit": 3000,  # Maximum chat count per month
    },
}


def get_video_limit(user: User) -> int:
    """
    Get video limit for a user based on their plan.

    Args:
        user: User instance

    Returns:
        Maximum number of videos the user can keep
    """
    return PLAN_LIMITS[user.plan]["video_limit"]


def get_whisper_minutes_limit(user: User) -> float:
    """
    Get Whisper processing time limit (in minutes) for a user based on their plan.

    Args:
        user: User instance

    Returns:
        Maximum Whisper processing time per month in minutes
    """
    return PLAN_LIMITS[user.plan]["whisper_minutes_limit"]


def get_chat_limit(user: User) -> int:
    """
    Get chat count limit for a user based on their plan.

    Args:
        user: User instance

    Returns:
        Maximum chat count per month
    """
    return PLAN_LIMITS[user.plan]["chat_limit"]

