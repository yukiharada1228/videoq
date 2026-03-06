"""Cross-layer auth constants shared by boundaries."""

from app.domain.auth.entities import ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY
from app.domain.auth.scopes import SCOPE_CHAT_WRITE, SCOPE_READ, SCOPE_WRITE

__all__ = [
    "ACCESS_LEVEL_ALL",
    "ACCESS_LEVEL_READ_ONLY",
    "SCOPE_READ",
    "SCOPE_WRITE",
    "SCOPE_CHAT_WRITE",
]
