"""API key scope policy constants."""

from app.contracts.auth import SCOPE_CHAT_WRITE, SCOPE_READ, SCOPE_WRITE

READ_ONLY_ALLOWED_SCOPES = frozenset({SCOPE_READ, SCOPE_CHAT_WRITE})
