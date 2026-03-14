"""
Tests for LocalMediaStorage path traversal protection.
"""

import tempfile

from django.test import TestCase, override_settings

from app.infrastructure.storage.local_media_storage import LocalMediaStorage


class LocalMediaStoragePathValidationTests(TestCase):
    """LocalMediaStorage が危険なパスを拒否することを確認する。"""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.storage = LocalMediaStorage()

    @override_settings(MEDIA_ROOT="/tmp/media_root")
    def test_absolute_path_raises_on_exists(self):
        with self.assertRaises(ValueError):
            self.storage.exists("/etc/passwd")

    @override_settings(MEDIA_ROOT="/tmp/media_root")
    def test_absolute_path_raises_on_open(self):
        with self.assertRaises(ValueError):
            self.storage.open("/etc/passwd")

    @override_settings(MEDIA_ROOT="/tmp/media_root")
    def test_dotdot_path_raises_on_exists(self):
        with self.assertRaises(ValueError):
            self.storage.exists("../secret")

    @override_settings(MEDIA_ROOT="/tmp/media_root")
    def test_double_dotdot_raises_on_exists(self):
        with self.assertRaises(ValueError):
            self.storage.exists("../../etc/passwd")

    @override_settings(MEDIA_ROOT="/tmp/media_root")
    def test_embedded_dotdot_raises_on_exists(self):
        with self.assertRaises(ValueError):
            self.storage.exists("videos/../../../etc/passwd")

    def test_valid_path_does_not_raise_on_exists(self):
        with override_settings(MEDIA_ROOT=self.tmp):
            result = self.storage.exists("videos/test.mp4")
        self.assertFalse(result)

    def test_valid_nested_path_does_not_raise_on_exists(self):
        with override_settings(MEDIA_ROOT=self.tmp):
            result = self.storage.exists("2024/01/videos/test.mp4")
        self.assertFalse(result)

    @override_settings(MEDIA_ROOT="/tmp/media_root")
    def test_path_with_escaped_traversal_raises(self):
        """解決後に MEDIA_ROOT 外に出るパスは拒否する。"""
        with self.assertRaises(ValueError):
            self.storage.exists("videos/../../../../etc/passwd")

    def test_startswith_false_positive_is_rejected(self):
        """
        MEDIA_ROOT が /tmp/media の場合、/tmp/media_evil/file は
        str.startswith("/tmp/media") が True になるが、正しく拒否されなければならない。
        Path.is_relative_to() を使っていれば False になる。
        """
        import os
        import tempfile

        # /tmp/media_<suffix> と /tmp/media_<suffix>_evil のような2つのディレクトリを作る
        base = tempfile.mkdtemp()
        sibling = base + "_evil"
        os.makedirs(sibling, exist_ok=True)
        # sibling 内にファイルを作る
        evil_file = os.path.join(sibling, "secret.txt")
        with open(evil_file, "w") as f:
            f.write("secret")
        # MEDIA_ROOT = base, path = ../base_evil/secret.txt
        # .. は拒否されるので、symlink で試みる
        link_path = os.path.join(base, "evil_link")
        os.symlink(sibling, link_path)
        try:
            with override_settings(MEDIA_ROOT=base):
                with self.assertRaises(ValueError):
                    self.storage.exists("evil_link/secret.txt")
        finally:
            os.unlink(link_path)
            os.remove(evil_file)
            os.rmdir(sibling)
