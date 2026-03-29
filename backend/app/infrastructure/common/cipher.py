"""Fernet symmetric encryption derived from Django SECRET_KEY."""

import base64
import hashlib

from cryptography.fernet import Fernet
from django.conf import settings


class FernetCipher:
    """Encrypt/decrypt strings using a Fernet key derived from SECRET_KEY via PBKDF2."""

    _SALT = b"videoq-user-secret-key"
    _ITERATIONS = 480_000

    def __init__(self) -> None:
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            settings.SECRET_KEY.encode(),
            self._SALT,
            self._ITERATIONS,
        )
        self._fernet = Fernet(base64.urlsafe_b64encode(dk))

    def encrypt(self, plaintext: str) -> bytes:
        return self._fernet.encrypt(plaintext.encode())

    def decrypt(self, ciphertext: bytes) -> str:
        return self._fernet.decrypt(ciphertext).decode()
