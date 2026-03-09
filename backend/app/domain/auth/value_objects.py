"""Value objects for auth input normalization."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Username:
    """Normalized username string."""

    value: str

    @classmethod
    def from_raw(cls, raw: str, *, require_non_blank: bool = False) -> "Username":
        normalized = raw.strip()
        if require_non_blank and not normalized:
            raise ValueError("blank username")
        return cls(value=normalized)


@dataclass(frozen=True)
class EmailAddress:
    """Normalized email string."""

    value: str

    @classmethod
    def from_raw(cls, raw: str, *, require_non_blank: bool = False) -> "EmailAddress":
        normalized = raw.strip()
        if require_non_blank and not normalized:
            raise ValueError("blank email")
        return cls(value=normalized)


@dataclass(frozen=True)
class RefreshTokenValue:
    """Normalized refresh-token string."""

    value: str

    @classmethod
    def from_raw(
        cls,
        raw: str,
        *,
        require_non_blank: bool = False,
    ) -> "RefreshTokenValue":
        normalized = raw.strip()
        if require_non_blank and not normalized:
            raise ValueError("blank refresh token")
        return cls(value=normalized)


@dataclass(frozen=True)
class UidTokenComponent:
    """Normalized uid/token component for reset/verification links."""

    value: str

    @classmethod
    def from_raw(cls, raw: str, *, require_non_blank: bool = False) -> "UidTokenComponent":
        normalized = raw.strip()
        if require_non_blank and not normalized:
            raise ValueError("blank uid/token component")
        return cls(value=normalized)

