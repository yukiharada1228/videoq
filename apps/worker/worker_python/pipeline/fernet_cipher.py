"""Django/Hono-compatible Fernet cipher (PBKDF2 from JWT_SECRET/SECRET_KEY)."""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken


class FernetCipher:
    _SALT = b"videoq-user-secret-key"
    _ITERATIONS = 480_000

    def __init__(self, secret: str | None = None) -> None:
        key = (secret or os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY") or "").encode()
        if not key:
            raise RuntimeError("JWT_SECRET or SECRET_KEY is required to decrypt Fernet secrets")
        dk = hashlib.pbkdf2_hmac("sha256", key, self._SALT, self._ITERATIONS)
        self._fernet = Fernet(base64.urlsafe_b64encode(dk))

    def decrypt(self, ciphertext: bytes) -> str:
        return self._fernet.decrypt(ciphertext).decode()


def try_decrypt(ciphertext: bytes | memoryview | None) -> str | None:
    if ciphertext is None:
        return None
    raw = bytes(ciphertext)
    if not raw:
        return None
    try:
        return FernetCipher().decrypt(raw)
    except (RuntimeError, InvalidToken, ValueError):
        return None
