from unittest.mock import Mock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from app.auth.use_cases import (ConfirmPasswordResetUseCase,
                                CreateApiKeyCommand, CreateApiKeyUseCase,
                                DeleteAccountCommand, DeleteAccountUseCase,
                                GetCurrentUserQuery, GetCurrentUserUseCase,
                                ListApiKeysQuery, ListApiKeysUseCase,
                                LoginCommand, LoginUserUseCase,
                                PasswordResetConfirmCommand,
                                PasswordResetRequestCommand,
                                RefreshAccessTokenUseCase, RefreshCommand,
                                RequestPasswordResetUseCase,
                                RevokeApiKeyCommand, RevokeApiKeyUseCase,
                                SignupCommand, SignupUserUseCase,
                                VerifyEmailCommand, VerifyEmailUseCase)

User = get_user_model()


class LoginUserUseCaseTests(APITestCase):
    def test_execute_returns_token_pair(self):
        user = User(username="tester")
        credential_authenticator = Mock(return_value=user)
        token_pair_issuer = Mock(
            return_value={"access": "a-token", "refresh": "r-token"}
        )

        result = LoginUserUseCase(
            credential_authenticator=credential_authenticator,
            token_pair_issuer=token_pair_issuer,
        ).execute(LoginCommand(username="tester", password="secret"))

        self.assertEqual(result.access, "a-token")
        self.assertEqual(result.refresh, "r-token")
        credential_authenticator.assert_called_once_with(
            username="tester",
            password="secret",
        )
        token_pair_issuer.assert_called_once_with(user=user)


class RefreshAccessTokenUseCaseTests(APITestCase):
    def test_execute_returns_access_token(self):
        access_token_issuer = Mock(return_value="new-access")

        result = RefreshAccessTokenUseCase(
            access_token_issuer=access_token_issuer
        ).execute(RefreshCommand(refresh_token="refresh-token"))

        self.assertEqual(result.access, "new-access")
        access_token_issuer.assert_called_once_with(refresh_token="refresh-token")


class SignupUserUseCaseTests(APITestCase):
    def test_execute_delegates_to_creator(self):
        user_creator = Mock(return_value=type("UserObj", (), {"id": 11})())

        use_case = SignupUserUseCase(user_creator=user_creator)
        result = use_case.execute(
            SignupCommand(
                username="tester",
                email="tester@example.com",
                password="secret123",
            )
        )

        self.assertEqual(result.user_id, 11)
        user_creator.assert_called_once_with(
            username="tester",
            email="tester@example.com",
            password="secret123",
        )


class VerifyEmailUseCaseTests(APITestCase):
    def test_execute_resolves_and_activates(self):
        user = User(id=5, username="tester", is_active=False)
        activated_user = User(id=5, username="tester", is_active=True)
        email_verification_user_resolver = Mock(return_value=user)
        user_activator = Mock(return_value=activated_user)

        result = VerifyEmailUseCase(
            email_verification_user_resolver=email_verification_user_resolver,
            user_activator=user_activator,
        ).execute(VerifyEmailCommand(uid="uid", token="token"))

        self.assertEqual(result.user_id, 5)
        self.assertTrue(result.is_active)
        email_verification_user_resolver.assert_called_once_with(
            uid="uid", token="token"
        )
        user_activator.assert_called_once_with(user)


class RequestPasswordResetUseCaseTests(APITestCase):
    def test_execute_sends_email(self):
        password_reset_email_sender = Mock(return_value="user-obj")

        result = RequestPasswordResetUseCase(
            password_reset_email_sender=password_reset_email_sender,
        ).execute(PasswordResetRequestCommand(email="test@example.com"))

        self.assertTrue(result.email_sent)
        password_reset_email_sender.assert_called_once_with(email="test@example.com")

    def test_execute_returns_false_when_no_user(self):
        password_reset_email_sender = Mock(return_value=None)

        result = RequestPasswordResetUseCase(
            password_reset_email_sender=password_reset_email_sender,
        ).execute(PasswordResetRequestCommand(email="unknown@example.com"))

        self.assertFalse(result.email_sent)


class ConfirmPasswordResetUseCaseTests(APITestCase):
    def test_execute_resolves_and_resets(self):
        user = type("UserObj", (), {"id": 7})()
        password_reset_user_resolver = Mock(return_value=user)
        password_resetter = Mock(return_value=user)

        result = ConfirmPasswordResetUseCase(
            password_reset_user_resolver=password_reset_user_resolver,
            password_resetter=password_resetter,
        ).execute(
            PasswordResetConfirmCommand(
                uid="uid", token="token", new_password="new-pass"
            )
        )

        self.assertEqual(result.user_id, 7)
        password_reset_user_resolver.assert_called_once_with(
            uid="uid", token="token", new_password="new-pass"
        )
        password_resetter.assert_called_once_with(user=user, new_password="new-pass")


class DeleteAccountUseCaseTests(APITestCase):
    def test_execute_returns_user_id(self):
        user = type("UserObj", (), {"id": 3})()
        actor_loader = Mock(return_value=user)
        account_deactivator = Mock()

        result = DeleteAccountUseCase(
            actor_loader=actor_loader,
            account_deactivator=account_deactivator,
        ).execute(DeleteAccountCommand(actor_id=3, reason="cleanup"))

        self.assertEqual(result.user_id, 3)
        actor_loader.assert_called_once_with(3)
        account_deactivator.assert_called_once_with(user=user, reason="cleanup")


class GetCurrentUserUseCaseTests(APITestCase):
    def test_execute_returns_user_info(self):
        user = type(
            "UserObj",
            (),
            {
                "id": 1,
                "username": "tester",
                "email": "test@example.com",
                "video_limit": 10,
                "video_count": 3,
            },
        )()
        current_user_loader = Mock(return_value=user)

        result = GetCurrentUserUseCase(
            current_user_loader=current_user_loader,
        ).execute(GetCurrentUserQuery(user_id=1))

        self.assertEqual(result.id, 1)
        self.assertEqual(result.username, "tester")
        self.assertEqual(result.video_count, 3)
        current_user_loader.assert_called_once_with(user_id=1)


class CreateApiKeyUseCaseTests(APITestCase):
    def test_execute_returns_wrapped_result(self):
        api_key = type(
            "ApiKeyObj",
            (),
            {
                "id": 9,
                "name": "integration",
                "access_level": "all",
                "prefix": "integration.",
                "last_used_at": None,
                "created_at": None,
            },
        )()
        user = type("UserObj", (), {"id": 7})()
        actor_loader = Mock(return_value=user)
        api_key_creator = Mock(return_value=(api_key, "raw-key"))

        result = CreateApiKeyUseCase(
            actor_loader=actor_loader,
            api_key_creator=api_key_creator,
        ).execute(
            CreateApiKeyCommand(actor_id=7, name="integration", access_level="all"),
        )

        self.assertEqual(result.api_key.id, 9)
        self.assertEqual(result.api_key.name, "integration")
        self.assertEqual(result.raw_key, "raw-key")
        actor_loader.assert_called_once_with(7)
        api_key_creator.assert_called_once_with(
            user=user, name="integration", access_level="all"
        )


class RevokeApiKeyUseCaseTests(APITestCase):
    def test_execute_delegates_to_revoker(self):
        user = type("UserObj", (), {"id": 3})()
        actor_loader = Mock(return_value=user)
        api_key_revoker = Mock()

        RevokeApiKeyUseCase(
            actor_loader=actor_loader,
            api_key_revoker=api_key_revoker,
        ).execute(RevokeApiKeyCommand(actor_id=3, api_key_id=9))

        actor_loader.assert_called_once_with(3)
        api_key_revoker.assert_called_once_with(user=user, api_key_id=9)


class ListApiKeysUseCaseTests(APITestCase):
    def test_execute_returns_queryset(self):
        user = type("UserObj", (), {"id": 1})()
        actor_loader = Mock(return_value=user)
        api_keys_loader = Mock(return_value=["key1", "key2"])

        result = ListApiKeysUseCase(
            actor_loader=actor_loader,
            api_keys_loader=api_keys_loader,
        ).execute(ListApiKeysQuery(actor_id=1))

        self.assertEqual(result, ["key1", "key2"])
        actor_loader.assert_called_once_with(1)
        api_keys_loader.assert_called_once_with(user=user)
