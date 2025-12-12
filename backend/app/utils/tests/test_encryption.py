"""
Tests for encryption utilities.
"""
from django.test import TestCase

from app.utils.encryption import decrypt_api_key, encrypt_api_key


class EncryptionUtilsTestCase(TestCase):
    """Tests for encryption and decryption utilities"""

    def test_encrypt_api_key(self):
        """Test encrypting an API key"""
        api_key = "sk-proj-test1234567890abcdefghijklmnopqrstuvwxyz"
        encrypted = encrypt_api_key(api_key)

        # Verify encrypted key is bytes
        self.assertIsInstance(encrypted, bytes)

        # Verify encrypted key is different from original
        self.assertNotEqual(encrypted, api_key.encode())

        # Verify encrypted key has reasonable length (Fernet tokens are base64 encoded)
        self.assertGreater(len(encrypted), len(api_key))

    def test_decrypt_api_key(self):
        """Test decrypting an API key"""
        api_key = "sk-proj-test1234567890abcdefghijklmnopqrstuvwxyz"
        encrypted = encrypt_api_key(api_key)
        decrypted = decrypt_api_key(encrypted)

        # Verify decrypted key matches original
        self.assertEqual(decrypted, api_key)
        self.assertIsInstance(decrypted, str)

    def test_encrypt_decrypt_round_trip(self):
        """Test encrypt and decrypt round trip"""
        test_keys = [
            "sk-proj-short",
            "sk-proj-test1234567890abcdefghijklmnopqrstuvwxyz",
            "sk-proj-very-long-key-with-many-characters-12345678901234567890",
        ]

        for api_key in test_keys:
            with self.subTest(api_key=api_key):
                encrypted = encrypt_api_key(api_key)
                decrypted = decrypt_api_key(encrypted)
                self.assertEqual(decrypted, api_key)

    def test_encrypt_empty_string(self):
        """Test encrypting an empty string"""
        api_key = ""
        encrypted = encrypt_api_key(api_key)
        decrypted = decrypt_api_key(encrypted)

        self.assertEqual(decrypted, api_key)

    def test_encrypt_special_characters(self):
        """Test encrypting API key with special characters"""
        api_key = "sk-proj-test!@#$%^&*()_+-=[]{}|;:,.<>?"
        encrypted = encrypt_api_key(api_key)
        decrypted = decrypt_api_key(encrypted)

        self.assertEqual(decrypted, api_key)

    def test_encryption_is_deterministic_same_session(self):
        """Test that encryption produces different results each time (with IV)"""
        api_key = "sk-proj-test1234567890abcdefghijklmnopqrstuvwxyz"
        encrypted1 = encrypt_api_key(api_key)
        encrypted2 = encrypt_api_key(api_key)

        # Fernet includes timestamp, so encryptions should be different
        # but both should decrypt to the same value
        self.assertNotEqual(encrypted1, encrypted2)
        self.assertEqual(decrypt_api_key(encrypted1), api_key)
        self.assertEqual(decrypt_api_key(encrypted2), api_key)

    def test_decrypt_invalid_data(self):
        """Test decrypting invalid data raises exception"""
        invalid_data = b"invalid-encrypted-data"

        with self.assertRaises(Exception):
            decrypt_api_key(invalid_data)

    def test_encrypt_unicode_characters(self):
        """Test encrypting API key with unicode characters"""
        api_key = "sk-proj-test-日本語-🔐"
        encrypted = encrypt_api_key(api_key)
        decrypted = decrypt_api_key(encrypted)

        self.assertEqual(decrypted, api_key)
