"""暗号化・復号化に関するユーティリティ関数"""

from django.conf import settings
from cryptography.fernet import Fernet
import base64


class EncryptionHelper:
    """暗号化・復号化のヘルパークラス（キー生成をキャッシュ）"""
    
    _cipher_suite = None
    
    @classmethod
    def get_cipher_suite(cls):
        """Fernet cipher suiteを取得（シングルトンパターン）"""
        if cls._cipher_suite is None:
            secret_key = settings.SECRET_KEY.encode()[:32].ljust(32, b'0')
            encryption_key = base64.urlsafe_b64encode(secret_key)
            cls._cipher_suite = Fernet(encryption_key)
        return cls._cipher_suite


def encrypt_api_key(plain_text: str) -> str:
    """APIキーを暗号化"""
    cipher_suite = EncryptionHelper.get_cipher_suite()
    return cipher_suite.encrypt(plain_text.encode()).decode()


def decrypt_api_key(encrypted_text: str) -> str:
    """APIキーを復号化"""
    cipher_suite = EncryptionHelper.get_cipher_suite()
    return cipher_suite.decrypt(encrypted_text.encode()).decode()


def is_encrypted(text: str) -> bool:
    """テキストが既に暗号化されているかチェック"""
    try:
        cipher_suite = EncryptionHelper.get_cipher_suite()
        cipher_suite.decrypt(text.encode())
        return True
    except:
        return False
