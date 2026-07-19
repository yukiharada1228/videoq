"""Unit tests for auth domain services."""

from unittest import TestCase

from app.domain.auth.services import (
    InvalidCredentials,
    InvalidUidTokenLink,
    PasswordResetRequestPolicy,
    SignupPolicy,
    SignupEmailAlreadyRegistered,
    UidTokenLinkPolicy,
    require_authenticated_user_id,
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

    def test_require_authenticated_user_id_raises_when_invalid(self):
        with self.assertRaises(InvalidCredentials):
            require_authenticated_user_id(user_id=None)

    def test_require_authenticated_user_id_returns_user_id_when_valid(self):
        self.assertEqual(require_authenticated_user_id(user_id=7), 7)
