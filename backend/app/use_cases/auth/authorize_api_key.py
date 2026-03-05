"""
Use case: authorize an authenticated API key against a required scope.
"""

from app.domain.auth.entities import ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY

SCOPE_READ = "read"
SCOPE_WRITE = "write"
SCOPE_CHAT_WRITE = "chat_write"


class AuthorizeApiKeyUseCase:
    """Authorize API key access by access level and required scope."""

    _READ_ONLY_ALLOWED_SCOPES = {SCOPE_READ, SCOPE_CHAT_WRITE}

    def execute(self, *, access_level: str, required_scope: str) -> bool:
        if access_level == ACCESS_LEVEL_ALL:
            return True

        if access_level == ACCESS_LEVEL_READ_ONLY:
            return required_scope in self._READ_ONLY_ALLOWED_SCOPES

        return False
