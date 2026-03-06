"""API key scope policy constants."""

SCOPE_READ = "read"
SCOPE_WRITE = "write"
SCOPE_CHAT_WRITE = "chat_write"

READ_ONLY_ALLOWED_SCOPES = frozenset({SCOPE_READ, SCOPE_CHAT_WRITE})
