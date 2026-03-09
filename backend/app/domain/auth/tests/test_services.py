"""Unit tests for auth domain services."""

from unittest import TestCase

from app.domain.auth.services import (
    InvalidCredentials,
    InvalidRefreshTokenInput,
    InvalidSignupInput,
    InvalidUidTokenLink,
    LoginCredentialsPolicy,
    PasswordResetRequestPolicy,
    RefreshTokenPolicy,
    SignupPolicy,
    SignupEmailAlreadyRegistered,
    UidTokenLinkPolicy,
    assert_signup_email_available,
    normalize_signup_email,
    normalize_password_reset_email,
    require_authenticated_user_id,
    require_refresh_token_input,
    require_signup_input,
    require_uid_token_input,
    require_user_id_from_uid_token,
    require_valid_login_input,
    should_send_password_reset,
)


class AuthDomainServicesTests(TestCase):
    def test_signup_policy_normalizes_email(self):
        policy = SignupPolicy(email="  user@example.com  ")
        self.assertEqual(policy.normalized_email(), "user@example.com")

    def test_signup_policy_raises_when_email_exists(self):
        policy = SignupPolicy(email="user@example.com")
        with self.assertRaises(SignupEmailAlreadyRegistered):
            policy.assert_email_available(email_exists=True)

    def test_password_reset_request_policy_normalizes_email(self):
        policy = PasswordResetRequestPolicy(email="  user@example.com  ")
        self.assertEqual(policy.normalized_email(), "user@example.com")

    def test_password_reset_request_policy_should_send(self):
        policy = PasswordResetRequestPolicy(email="user@example.com")
        self.assertTrue(policy.should_send(user_id=1))
        self.assertFalse(policy.should_send(user_id=None))

    def test_uid_token_link_policy_requires_user_id(self):
        policy = UidTokenLinkPolicy(invalid_message="Invalid link.")
        with self.assertRaises(InvalidUidTokenLink):
            policy.require_user_id(user_id=None)
        self.assertEqual(policy.require_user_id(user_id=10), 10)

    def test_normalize_signup_email_trims_whitespace(self):
        self.assertEqual(
            normalize_signup_email("  user@example.com  "), "user@example.com"
        )

    def test_assert_signup_email_available_raises_when_email_exists(self):
        with self.assertRaises(SignupEmailAlreadyRegistered):
            assert_signup_email_available(email_exists=True)

    def test_assert_signup_email_available_allows_when_email_not_exists(self):
        assert_signup_email_available(email_exists=False)

    def test_normalize_password_reset_email_trims_whitespace(self):
        self.assertEqual(
            normalize_password_reset_email("  user@example.com  "),
            "user@example.com",
        )

    def test_should_send_password_reset_false_when_user_missing(self):
        self.assertFalse(should_send_password_reset(user_id=None))

    def test_should_send_password_reset_true_when_user_exists(self):
        self.assertTrue(should_send_password_reset(user_id=1))

    def test_require_user_id_from_uid_token_raises_when_missing(self):
        with self.assertRaises(InvalidUidTokenLink):
            require_user_id_from_uid_token(
                user_id=None,
                message="Invalid or expired link.",
            )

    def test_require_user_id_from_uid_token_returns_user_id_when_present(self):
        self.assertEqual(
            require_user_id_from_uid_token(
                user_id=42,
                message="Invalid or expired link.",
            ),
            42,
        )

    def test_require_authenticated_user_id_raises_when_invalid(self):
        with self.assertRaises(InvalidCredentials):
            require_authenticated_user_id(user_id=None)

    def test_require_authenticated_user_id_returns_user_id_when_valid(self):
        self.assertEqual(require_authenticated_user_id(user_id=7), 7)

    def test_login_credentials_policy_normalizes_username(self):
        policy = LoginCredentialsPolicy(username="  alice  ", password="secret")
        self.assertEqual(policy.normalized_username(), "alice")

    def test_login_credentials_policy_rejects_blank_username(self):
        policy = LoginCredentialsPolicy(username="   ", password="secret")
        with self.assertRaises(InvalidCredentials):
            policy.require_valid_input()

    def test_login_credentials_policy_rejects_empty_password(self):
        policy = LoginCredentialsPolicy(username="alice", password="")
        with self.assertRaises(InvalidCredentials):
            policy.require_valid_input()

    def test_require_valid_login_input_returns_normalized_username(self):
        self.assertEqual(
            require_valid_login_input(username="  alice  ", password="secret"),
            "alice",
        )

    def test_refresh_token_policy_rejects_blank_input(self):
        policy = RefreshTokenPolicy(refresh_token="   ")
        with self.assertRaises(InvalidRefreshTokenInput):
            policy.require_token()

    def test_require_refresh_token_input_returns_trimmed_token(self):
        self.assertEqual(
            require_refresh_token_input(refresh_token="  abc.def  "),
            "abc.def",
        )

    def test_signup_policy_rejects_blank_required_fields(self):
        policy = SignupPolicy(email="  ")
        with self.assertRaises(InvalidSignupInput):
            policy.require_valid_input(username="  ", password="secret")
        with self.assertRaises(InvalidSignupInput):
            policy.require_valid_input(username="alice", password="")

    def test_require_signup_input_returns_normalized_values(self):
        username, email, password = require_signup_input(
            username="  alice  ",
            email="  alice@example.com  ",
            password="secret",
        )
        self.assertEqual(username, "alice")
        self.assertEqual(email, "alice@example.com")
        self.assertEqual(password, "secret")

    def test_uid_token_link_policy_rejects_blank_uid_or_token(self):
        policy = UidTokenLinkPolicy(invalid_message="Invalid link")
        with self.assertRaises(InvalidUidTokenLink):
            policy.require_uid_token_input(uidb64="  ", token="token")
        with self.assertRaises(InvalidUidTokenLink):
            policy.require_uid_token_input(uidb64="uid", token="  ")

    def test_require_uid_token_input_returns_trimmed_values(self):
        uidb64, token = require_uid_token_input(
            uidb64="  uid  ",
            token="  token  ",
            message="Invalid link",
        )
        self.assertEqual(uidb64, "uid")
        self.assertEqual(token, "token")
