from unittest.mock import Mock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from app.auth.use_cases import (CreateApiKeyCommand, CreateApiKeyUseCase,
                                LoginCommand, LoginUserUseCase,
                                RefreshAccessTokenUseCase, RefreshCommand,
                                SignupCommand, SignupUserUseCase,
                                VerifyEmailCommand, VerifyEmailUseCase)

User = get_user_model()


class LoginUserUseCaseTests(APITestCase):
    def test_execute_returns_token_pair(self):
        user = User(username="tester")
        credential_authenticator = Mock(return_value=user)
        token_pair_issuer = Mock(return_value={"access": "a-token", "refresh": "r-token"})

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
        signup_user_creator = Mock(return_value="created-user")

        use_case = SignupUserUseCase(signup_user_creator=signup_user_creator)
        result = use_case.execute(
            SignupCommand(
                username="tester",
                email="tester@example.com",
                password="secret123",
            )
        )

        self.assertEqual(result, "created-user")
        signup_user_creator.assert_called_once()


class VerifyEmailUseCaseTests(APITestCase):
    def test_execute_resolves_and_activates(self):
        user = User(username="tester")
        email_verification_resolver = Mock(return_value=user)

        result = VerifyEmailUseCase(
            email_verification_resolver=email_verification_resolver,
        ).execute(VerifyEmailCommand(uid="uid", token="token"))

        self.assertEqual(result, user)
        email_verification_resolver.assert_called_once_with(
            VerifyEmailCommand(uid="uid", token="token")
        )


class CreateApiKeyUseCaseTests(APITestCase):
    def test_execute_returns_wrapped_result(self):
        api_key = object()
        api_key_creator = Mock(return_value=(api_key, "raw-key"))

        result = CreateApiKeyUseCase(api_key_creator=api_key_creator).execute(
            CreateApiKeyCommand(name="integration", access_level="all"),
            user="user",
        )

        self.assertIs(result.api_key, api_key)
        self.assertEqual(result.raw_key, "raw-key")
        api_key_creator.assert_called_once_with(
            user="user",
            name="integration",
            access_level="all",
        )
