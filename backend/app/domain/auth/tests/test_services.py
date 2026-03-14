"""Unit tests for auth domain services."""

from unittest import TestCase

from app.domain.auth.services import (
    InvalidCredentials,
    InvalidUidTokenLink,
    PasswordResetRequestPolicy,
    SignupPolicy,
    SignupEmailAlreadyRegistered,
    UidTokenLinkPolicy,
    assert_signup_email_available,
    normalize_signup_email,
    normalize_password_reset_email,
    require_authenticated_user_id,
    require_user_id_from_uid_token,
    should_send_password_reset,
)


class AuthDomainServicesTests(TestCase):
    def test_signup_policy_normalizes_email(self):
        policy = SignupPolicy(email="  User@Example.COM  ")
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

    def test_normalize_signup_email_trims_whitespace_and_lowercases(self):
        self.assertEqual(
            normalize_signup_email("  User@Example.COM  "), "user@example.com"
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
