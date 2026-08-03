from worker_python.pipeline.fernet_cipher import FernetCipher


def test_fernet_roundtrip(monkeypatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "unit-test-secret-key")
    cipher = FernetCipher()
    token = cipher._fernet.encrypt(b"search-api-key")
    assert FernetCipher().decrypt(token) == "search-api-key"
