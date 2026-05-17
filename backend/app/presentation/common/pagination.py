"""Shared pagination classes for presentation layer."""

from rest_framework.pagination import LimitOffsetPagination


class StandardLimitOffsetPagination(LimitOffsetPagination):
    """Unified limit/offset pagination for all list endpoints.

    Response envelope:
        {"count": N, "next": "...", "previous": "...", "results": [...]}
    """

    default_limit = 20
    max_limit = 100
