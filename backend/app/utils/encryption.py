"""暗号化・復号化に関するユーティリティ関数"""

from django.conf import settings
from cryptography.fernet import Fernet
import base64


def get_encryption_key():
    """DjangoのSECRET_KEYからFernetキーを生成"""
    secret_key = settings.SECRET_KEY.encode()[:32].ljust(32, b'0')
    return base64.urlsafe_b64encode(secret_key)


def encrypt_api_key(plain_text: str) -> str:
    """APIキーを暗号化"""
    encryption_key = get_encryption_key()
    cipher_suite = Fernet(encryption_key)
    return cipher_suite.encrypt(plain_text.encode()).decode()


def decrypt_api_key(encrypted_text: str) -> str:
    """APIキーを復号化"""
    encryption_key = get_encryption_key()
    cipher_suite = Fernet(encryption_key)
    return cipher_suite.decrypt(encrypted_text.encode()).decode()


def is_encrypted(text: str) -> bool:
    """テキストが既に暗号化されているかチェック"""
    try:
        encrypted_key = get_encryption_key()
        cipher_suite = Fernet(encrypted_key)
        cipher_suite.decrypt(text.encode())
        return True
    except:
        return False
