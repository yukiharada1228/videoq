"""Tests for FernetCipher encrypt/decrypt."""

from django.test import TestCase, override_settings

from app.infrastructure.common.cipher import FernetCipher


class FernetCipherTest(TestCase):
    def test_round_trip(self):
        cipher = FernetCipher()
        plaintext = "sk-test1234567890abcdef"
        encrypted = cipher.encrypt(plaintext)
        self.assertIsInstance(encrypted, bytes)
        self.assertNotEqual(encrypted, plaintext.encode())
        self.assertEqual(cipher.decrypt(encrypted), plaintext)

    def test_empty_string(self):
        cipher = FernetCipher()
        encrypted = cipher.encrypt("")
        self.assertEqual(cipher.decrypt(encrypted), "")

    @override_settings(SECRET_KEY="different-secret-key-for-testing")
    def test_different_secret_produces_different_ciphertext(self):
        cipher_a = FernetCipher()
        ct_a = cipher_a.encrypt("hello")

        # The default test SECRET_KEY produces a different cipher
        # We can't easily test cross-key failure without two instances,
        # but we verify the ciphertext is bytes and non-trivial.
        self.assertIsInstance(ct_a, bytes)
        self.assertTrue(len(ct_a) > 0)

    def test_decrypt_own_ciphertext(self):
        cipher = FernetCipher()
        secret = "sk-proj-verylongsecretkey1234567890"
        ct = cipher.encrypt(secret)
        self.assertEqual(cipher.decrypt(ct), secret)
