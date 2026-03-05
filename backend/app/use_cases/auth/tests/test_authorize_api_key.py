"""Tests for AuthorizeApiKeyUseCase."""

import unittest

from app.use_cases.auth.authorize_api_key import (
    SCOPE_CHAT_WRITE,
    SCOPE_READ,
    SCOPE_WRITE,
    AuthorizeApiKeyUseCase,
)


class AuthorizeApiKeyUseCaseTests(unittest.TestCase):
    def setUp(self):
        self.use_case = AuthorizeApiKeyUseCase()

    def test_all_access_key_allows_any_scope(self):
        self.assertTrue(self.use_case.execute(access_level="all", required_scope=SCOPE_WRITE))
        self.assertTrue(self.use_case.execute(access_level="all", required_scope=SCOPE_READ))

    def test_read_only_allows_read_and_chat_write(self):
        self.assertTrue(
            self.use_case.execute(access_level="read_only", required_scope=SCOPE_READ)
        )
        self.assertTrue(
            self.use_case.execute(
                access_level="read_only",
                required_scope=SCOPE_CHAT_WRITE,
            )
        )

    def test_read_only_blocks_write_scope(self):
        self.assertFalse(
            self.use_case.execute(access_level="read_only", required_scope=SCOPE_WRITE)
        )
