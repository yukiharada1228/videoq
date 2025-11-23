"""
Plan limit utilities

This module provides functions to get user-specific limits from the database
and check monthly usage limits.
"""

from typing import Optional

from django.db.models import Q, Sum
from django.utils import timezone

from app.models import ChatLog, User, Video


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


def get_first_day_of_month():
    """
    Get the first day of the current month at 00:00:00.

    Returns:
        datetime: First day of current month
    """
    now = timezone.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def get_monthly_chat_count(user: User, exclude_chat_log_id: Optional[int] = None):
    """
    Get monthly chat count for a user.

    Includes both direct chats and shared chats (where user is the group owner).

    Args:
        user: User instance
        exclude_chat_log_id: Optional chat log ID to exclude from count

    Returns:
        int: Monthly chat count
    """
    first_day_of_month = get_first_day_of_month()

    queryset = ChatLog.objects.filter(
        Q(user=user) | Q(group__user=user, is_shared_origin=True),
        created_at__gte=first_day_of_month,
    ).select_related("group", "group__user")

    if exclude_chat_log_id:
        queryset = queryset.exclude(id=exclude_chat_log_id)

    return queryset.count()


def get_monthly_whisper_usage(user: User, exclude_video_id: Optional[int] = None):
    """
    Get monthly Whisper usage in minutes for a user.

    Args:
        user: User instance
        exclude_video_id: Optional video ID to exclude from usage calculation

    Returns:
        float: Monthly Whisper usage in minutes
    """
    first_day_of_month = get_first_day_of_month()

    queryset = Video.objects.filter(
        user=user,
        uploaded_at__gte=first_day_of_month,
        duration_minutes__isnull=False,
    )

    if exclude_video_id:
        queryset = queryset.exclude(id=exclude_video_id)

    result = queryset.aggregate(total_minutes=Sum("duration_minutes"))["total_minutes"]
    return result or 0.0
