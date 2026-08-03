import base64

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from worker_python.pipeline.user_secret_envelope import UserSecretEnvelope, try_decrypt


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _envelope(key: bytes, plaintext: str, nonce: bytes = bytes(range(12))) -> str:
    ciphertext_and_tag = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    return f"v1.{_base64url(nonce)}.{_base64url(ciphertext_and_tag)}"


def test_decrypts_api_compatible_aes_gcm_envelope(monkeypatch) -> None:
    key = bytes(range(32))
    monkeypatch.setenv("USER_SECRET_ENCRYPTION_KEY", _base64url(key))

    envelope = _envelope(key, "search-api-key")

    assert UserSecretEnvelope().decrypt(envelope) == "search-api-key"
    assert UserSecretEnvelope().decrypt(envelope.encode()) == "search-api-key"
    assert UserSecretEnvelope().decrypt(memoryview(envelope.encode())) == "search-api-key"


def test_requires_base64url_encoded_32_byte_key(monkeypatch) -> None:
    monkeypatch.setenv("USER_SECRET_ENCRYPTION_KEY", _base64url(b"too-short"))

    with pytest.raises(ValueError, match="exactly 32 bytes"):
        UserSecretEnvelope()


@pytest.mark.parametrize(
    "envelope",
    [
        "v2.AA.AA",
        "v1.AA.AA",
        "v1.not*base64.AAAAAAAAAAAAAAAAAAAAAA",
    ],
)
def test_try_decrypt_rejects_invalid_envelopes(monkeypatch, envelope: str) -> None:
    monkeypatch.setenv("USER_SECRET_ENCRYPTION_KEY", _base64url(bytes(range(32))))

    assert try_decrypt(envelope) is None


def test_try_decrypt_rejects_tampered_ciphertext(monkeypatch) -> None:
    key = bytes(range(32))
    monkeypatch.setenv("USER_SECRET_ENCRYPTION_KEY", _base64url(key))
    envelope = _envelope(key, "search-api-key")
    version, nonce, ciphertext = envelope.split(".")
    ciphertext_bytes = bytearray(
        base64.urlsafe_b64decode(ciphertext + ("=" * (-len(ciphertext) % 4)))
    )
    ciphertext_bytes[0] ^= 1
    tampered = f"{version}.{nonce}.{_base64url(bytes(ciphertext_bytes))}"

    assert try_decrypt(tampered) is None


def test_try_decrypt_returns_none_without_key(monkeypatch) -> None:
    monkeypatch.delenv("USER_SECRET_ENCRYPTION_KEY", raising=False)

    assert try_decrypt("v1.AA.AA") is None
