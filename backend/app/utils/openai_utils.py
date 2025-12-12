"""
Utility functions for managing OpenAI API keys.
"""

from typing import Optional

from django.contrib.auth import get_user_model

from app.utils.encryption import decrypt_api_key

User = get_user_model()


class OpenAIApiKeyNotConfiguredError(Exception):
    """Raised when OpenAI API key is not configured for a user."""

    pass


def get_openai_api_key(user: User) -> Optional[str]:
    """
    Get OpenAI API key for a user (no fallback to environment variable).

    Args:
        user: The user instance.

    Returns:
        str: The decrypted API key if set, None otherwise.

    Example:
        >>> api_key = get_openai_api_key(request.user)
        >>> if api_key:
        >>>     client = OpenAI(api_key=api_key)
    """
    if user.openai_api_key_encrypted:
        return decrypt_api_key(user.openai_api_key_encrypted)
    return None


def require_openai_api_key(user: User) -> str:
    """
    Require OpenAI API key (raise exception if not set).

    Args:
        user: The user instance.

    Returns:
        str: The decrypted API key.

    Raises:
        OpenAIApiKeyNotConfiguredError: If the user has not set an API key.

    Example:
        >>> api_key = require_openai_api_key(request.user)
        >>> client = OpenAI(api_key=api_key)
    """
    api_key = get_openai_api_key(user)
    if not api_key:
        raise OpenAIApiKeyNotConfiguredError(
            "OpenAI API key is not configured. Please set your API key in settings."
        )
    return api_key
