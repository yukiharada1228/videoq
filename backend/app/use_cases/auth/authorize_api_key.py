"""
Use case: authorize an authenticated API key against a required scope.
"""

from app.domain.auth.entities import ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY
from app.domain.auth.scopes import READ_ONLY_ALLOWED_SCOPES


class AuthorizeApiKeyUseCase:
    """Authorize API key access by access level and required scope."""

    def execute(self, *, access_level: str, required_scope: str) -> bool:
        if access_level == ACCESS_LEVEL_ALL:
            return True

        if access_level == ACCESS_LEVEL_READ_ONLY:
            return required_scope in READ_ONLY_ALLOWED_SCOPES

        return False
