from django import template
from django.conf import settings

register = template.Library()


@register.filter(name="with_share_token_if_local")
def with_share_token_if_local(file_url: str, share_token: str) -> str:
    """
    Append "?share_token=..." only when using local storage (USE_S3 == FALSE).
    When S3 is enabled, return the original URL to avoid breaking presigned URLs.
    """
    if not share_token:
        return file_url

    # When S3 is enabled, never modify the presigned URL
    if getattr(settings, "USE_S3", False):
        return file_url

    # Append query parameter safely for local media URLs
    separator = "&" if "?" in (file_url or "") else "?"
    return f"{file_url}{separator}share_token={share_token}"
