"""DTOs for auth use cases."""

from dataclasses import dataclass


@dataclass(frozen=True)
class TokenPairOutput:
    """Use-case output DTO for access/refresh tokens."""

    access: str
    refresh: str
