"""Unit tests for auth domain entities and policies."""

from datetime import datetime
from unittest import TestCase

from app.domain.auth.entities import (
    ApiKeyEntity,
    DuplicateApiKeyName,
    InvalidCredentials,
    InvalidApiKeyAccessLevel,
    InvalidApiKeyName,
    InvalidRefreshTokenInput,
    InvalidSignupInput,
    InvalidUidTokenLink,
    LoginAttempt,
    PasswordResetRequest,
    RefreshSessionRequest,
    SignupEmailAlreadyRegistered,
    SignupRequest,
    UidTokenLink,
    assert_api_key_name_available,
    assert_valid_api_key_access_level,
    normalize_api_key_name,
    is_scope_allowed_for_access_level,
)
from app.domain.auth.scopes import SCOPE_CHAT_WRITE, SCOPE_READ, SCOPE_WRITE


class AuthDomainPoliciesTests(TestCase):
    def test_all_access_level_allows_any_scope(self):
        self.assertTrue(is_scope_allowed_for_access_level("all", SCOPE_WRITE))
        self.assertTrue(is_scope_allowed_for_access_level("all", SCOPE_READ))

    def test_read_only_access_level_allows_read_and_chat_write(self):
        self.assertTrue(is_scope_allowed_for_access_level("read_only", SCOPE_READ))
        self.assertTrue(is_scope_allowed_for_access_level("read_only", SCOPE_CHAT_WRITE))

    def test_unknown_access_level_is_denied(self):
        self.assertFalse(is_scope_allowed_for_access_level("unknown", SCOPE_READ))

    def test_api_key_entity_delegates_scope_authorization(self):
        entity = ApiKeyEntity(
            id=1,
            name="key",
            prefix="abcd",
            access_level="read_only",
            last_used_at=None,
            created_at=datetime.now(),
        )

        self.assertTrue(entity.allows_scope(SCOPE_READ))
        self.assertFalse(entity.allows_scope(SCOPE_WRITE))

    def test_assert_api_key_name_available_raises_when_name_exists(self):
        with self.assertRaises(DuplicateApiKeyName):
            assert_api_key_name_available(name="dup", exists_active_with_name=True)

    def test_assert_valid_api_key_access_level_raises_for_unknown_level(self):
        with self.assertRaises(InvalidApiKeyAccessLevel):
            assert_valid_api_key_access_level("admin")

    def test_normalize_api_key_name_trims_input(self):
        self.assertEqual(normalize_api_key_name("  my-key  "), "my-key")

    def test_normalize_api_key_name_raises_when_blank(self):
        with self.assertRaises(InvalidApiKeyName):
            normalize_api_key_name("   ")

    def test_signup_request_normalizes_and_validates(self):
        signup = SignupRequest(
            username="  alice  ",
            email="  alice@example.com  ",
            password="secret",
        )
        username, email, password = signup.normalized()
        self.assertEqual(username, "alice")
        self.assertEqual(email, "alice@example.com")
        self.assertEqual(password, "secret")

    def test_signup_request_rejects_invalid_input(self):
        with self.assertRaises(InvalidSignupInput):
            SignupRequest(username=" ", email="e@example.com", password="x").normalized()
        with self.assertRaises(InvalidSignupInput):
            SignupRequest(username="alice", email=" ", password="x").normalized()
        with self.assertRaises(InvalidSignupInput):
            SignupRequest(username="alice", email="e@example.com", password="").normalized()

    def test_signup_request_checks_email_availability(self):
        with self.assertRaises(SignupEmailAlreadyRegistered):
            SignupRequest(
                username="alice",
                email="alice@example.com",
                password="secret",
            ).assert_email_available(email_exists=True)

    def test_login_attempt_validates_and_requires_authenticated_user(self):
        login = LoginAttempt(username="  alice  ", password="secret")
        self.assertEqual(login.require_valid_input(), "alice")
        self.assertEqual(login.require_authenticated_user_id(user_id=3), 3)
        with self.assertRaises(InvalidCredentials):
            login.require_authenticated_user_id(user_id=None)

    def test_login_attempt_rejects_invalid_input(self):
        with self.assertRaises(InvalidCredentials):
            LoginAttempt(username=" ", password="x").require_valid_input()
        with self.assertRaises(InvalidCredentials):
            LoginAttempt(username="alice", password="").require_valid_input()

    def test_refresh_session_request_requires_non_blank_token(self):
        self.assertEqual(
            RefreshSessionRequest(refresh_token="  token  ").require_token(),
            "token",
        )
        with self.assertRaises(InvalidRefreshTokenInput):
            RefreshSessionRequest(refresh_token=" ").require_token()

    def test_uid_token_link_normalizes_and_requires_resolved_user(self):
        link = UidTokenLink(
            uidb64="  uid  ",
            token="  token  ",
            invalid_message="Invalid link",
        )
        self.assertEqual(link.normalized_components(), ("uid", "token"))
        self.assertEqual(link.require_resolved_user_id(user_id=5), 5)
        with self.assertRaises(InvalidUidTokenLink):
            link.require_resolved_user_id(user_id=None)

    def test_uid_token_link_rejects_blank_input(self):
        with self.assertRaises(InvalidUidTokenLink):
            UidTokenLink(
                uidb64=" ",
                token="token",
                invalid_message="Invalid link",
            ).normalized_components()

    def test_password_reset_request_normalizes_and_hides_user_existence(self):
        request = PasswordResetRequest(email="  user@example.com  ")
        self.assertEqual(request.normalized_email(), "user@example.com")
        self.assertTrue(request.should_send(user_id=1))
        self.assertFalse(request.should_send(user_id=None))
