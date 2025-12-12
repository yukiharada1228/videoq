"""
Encryption utilities for sensitive data like API keys.

Uses Fernet symmetric encryption with a key derived from Django's SECRET_KEY.
"""

import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from django.conf import settings


def _get_fernet_key() -> bytes:
    """
    Derive a Fernet key from Django's SECRET_KEY using PBKDF2.
    This ensures we have a properly formatted 32-byte key for Fernet.

    Returns:
        bytes: A URL-safe base64-encoded 32-byte key suitable for Fernet.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b'videoq-openai-api-key-salt',  # Static salt for consistency
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(settings.SECRET_KEY.encode()))
    return key


def encrypt_api_key(api_key: str) -> bytes:
    """
    Encrypt an API key using Fernet (derived from SECRET_KEY).

    Args:
        api_key: The plaintext API key to encrypt.

    Returns:
        bytes: The encrypted API key.

    Example:
        >>> encrypted = encrypt_api_key("sk-1234567890abcdef")
        >>> isinstance(encrypted, bytes)
        True
    """
    if not api_key:
        raise ValueError("API key cannot be empty")

    f = Fernet(_get_fernet_key())
    return f.encrypt(api_key.encode())


def decrypt_api_key(encrypted_key: bytes) -> str:
    """
    Decrypt an API key using Fernet (derived from SECRET_KEY).

    Args:
        encrypted_key: The encrypted API key to decrypt.

    Returns:
        str: The decrypted plaintext API key.

    Raises:
        cryptography.fernet.InvalidToken: If the encrypted key is invalid or corrupted.

    Example:
        >>> encrypted = encrypt_api_key("sk-1234567890abcdef")
        >>> decrypted = decrypt_api_key(encrypted)
        >>> decrypted
        'sk-1234567890abcdef'
    """
    if not encrypted_key:
        raise ValueError("Encrypted key cannot be empty")

    f = Fernet(_get_fernet_key())
    return f.decrypt(encrypted_key).decode()
