"""
Use case: authorize an authenticated API key against a required scope.
"""

from app.domain.auth.entities import is_scope_allowed_for_access_level


class AuthorizeApiKeyUseCase:
    """Authorize API key access by access level and required scope."""

    def execute(self, *, access_level: str, required_scope: str) -> bool:
        return is_scope_allowed_for_access_level(access_level, required_scope)
