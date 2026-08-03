"""Decrypt versioned AES-GCM user-secret envelopes shared with the API."""

from __future__ import annotations

import base64
import binascii
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _decode_base64url(value: str, *, field: str) -> bytes:
    try:
        encoded = value.encode("ascii")
        padded = encoded + (b"=" * (-len(encoded) % 4))
        return base64.b64decode(padded, altchars=b"-_", validate=True)
    except (UnicodeEncodeError, binascii.Error) as exc:
        raise ValueError(f"{field} must be valid base64url") from exc


class UserSecretEnvelope:
    """Decrypt ``v1.<nonce>.<ciphertext+tag>`` AES-256-GCM envelopes."""

    def __init__(self, encoded_key: str | None = None) -> None:
        key_value = encoded_key or os.environ.get("USER_SECRET_ENCRYPTION_KEY", "")
        if not key_value:
            raise RuntimeError("USER_SECRET_ENCRYPTION_KEY is required to decrypt user secrets")
        key = _decode_base64url(key_value, field="USER_SECRET_ENCRYPTION_KEY")
        if len(key) != 32:
            raise ValueError("USER_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes")
        self._aesgcm = AESGCM(key)

    def decrypt(self, envelope: str | bytes | memoryview) -> str:
        if isinstance(envelope, str):
            value = envelope
        else:
            value = bytes(envelope).decode("ascii")

        parts = value.split(".")
        if len(parts) != 3 or parts[0] != "v1":
            raise ValueError("user-secret envelope must use the v1 format")

        nonce = _decode_base64url(parts[1], field="nonce")
        ciphertext_and_tag = _decode_base64url(parts[2], field="ciphertext")
        if len(nonce) != 12:
            raise ValueError("AES-GCM nonce must be exactly 12 bytes")
        if len(ciphertext_and_tag) < 16:
            raise ValueError("AES-GCM ciphertext must include a 16-byte authentication tag")

        return self._aesgcm.decrypt(nonce, ciphertext_and_tag, None).decode("utf-8")


def try_decrypt(envelope: str | bytes | memoryview | None) -> str | None:
    if envelope is None:
        return None
    if not envelope or (not isinstance(envelope, str) and not bytes(envelope)):
        return None
    try:
        return UserSecretEnvelope().decrypt(envelope)
    except (RuntimeError, ValueError, InvalidTag, UnicodeError):
        return None
