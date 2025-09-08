import base64
import hashlib
from cryptography.fernet import Fernet
from django.conf import settings


def get_fernet():
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key)
    return Fernet(fernet_key)


def encrypt_api_key(api_key: str) -> str:
    f = get_fernet()
    return f.encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    f = get_fernet()
    return f.decrypt(encrypted.encode()).decode()
