from dataclasses import dataclass

from app.auth.ports import (AccessTokenIssuer, AccountDeactivator,
                            ApiKeyCreator, ApiKeyRevoker,
                            CredentialAuthenticator, CurrentUserLoader,
                            EmailVerificationResolver,
                            PasswordResetRequester, PasswordResetResolver,
                            SignupUserCreator, TokenPairIssuer)


@dataclass(frozen=True)
class LoginCommand:
    username: str
    password: str


@dataclass(frozen=True)
class LoginResult:
    access: str
    refresh: str


class LoginUserUseCase:
    def __init__(
        self,
        *,
        credential_authenticator: CredentialAuthenticator,
        token_pair_issuer: TokenPairIssuer,
    ):
        self._credential_authenticator = credential_authenticator
        self._token_pair_issuer = token_pair_issuer

    def execute(self, command: LoginCommand) -> LoginResult:
        user = self._credential_authenticator(
            username=command.username,
            password=command.password,
        )
        token_pair = self._token_pair_issuer(user=user)
        return LoginResult(
            access=token_pair["access"],
            refresh=token_pair["refresh"],
        )


@dataclass(frozen=True)
class RefreshCommand:
    refresh_token: str


@dataclass(frozen=True)
class RefreshResult:
    access: str


class RefreshAccessTokenUseCase:
    def __init__(self, *, access_token_issuer: AccessTokenIssuer):
        self._access_token_issuer = access_token_issuer

    def execute(self, command: RefreshCommand) -> RefreshResult:
        access = self._access_token_issuer(refresh_token=command.refresh_token)
        return RefreshResult(access=access)


@dataclass(frozen=True)
class SignupCommand:
    username: str
    email: str
    password: str


class SignupUserUseCase:
    def __init__(self, *, signup_user_creator: SignupUserCreator):
        self._signup_user_creator = signup_user_creator

    def execute(self, command: SignupCommand):
        return self._signup_user_creator(command)


@dataclass(frozen=True)
class VerifyEmailCommand:
    uid: str
    token: str


class VerifyEmailUseCase:
    def __init__(self, *, email_verification_resolver: EmailVerificationResolver):
        self._email_verification_resolver = email_verification_resolver

    def execute(self, command: VerifyEmailCommand):
        return self._email_verification_resolver(command)


@dataclass(frozen=True)
class PasswordResetRequestCommand:
    email: str


class RequestPasswordResetUseCase:
    def __init__(self, *, password_reset_requester: PasswordResetRequester):
        self._password_reset_requester = password_reset_requester

    def execute(self, command: PasswordResetRequestCommand):
        return self._password_reset_requester(command)


@dataclass(frozen=True)
class PasswordResetConfirmCommand:
    uid: str
    token: str
    new_password: str


class ConfirmPasswordResetUseCase:
    def __init__(self, *, password_reset_resolver: PasswordResetResolver):
        self._password_reset_resolver = password_reset_resolver

    def execute(self, command: PasswordResetConfirmCommand):
        return self._password_reset_resolver(command)


@dataclass(frozen=True)
class DeleteAccountCommand:
    reason: str


class DeleteAccountUseCase:
    def __init__(self, *, account_deactivator: AccountDeactivator):
        self._account_deactivator = account_deactivator

    def execute(self, command: DeleteAccountCommand, *, user):
        return self._account_deactivator(user=user, reason=command.reason)


@dataclass(frozen=True)
class GetCurrentUserQuery:
    user_id: int


class GetCurrentUserUseCase:
    def __init__(self, *, current_user_loader: CurrentUserLoader):
        self._current_user_loader = current_user_loader

    def execute(self, query: GetCurrentUserQuery):
        return self._current_user_loader(query)


@dataclass(frozen=True)
class ApiKeyResult:
    api_key: object
    raw_key: str


@dataclass(frozen=True)
class CreateApiKeyCommand:
    name: str
    access_level: str


class CreateApiKeyUseCase:
    def __init__(self, *, api_key_creator: ApiKeyCreator):
        self._api_key_creator = api_key_creator

    def execute(self, command: CreateApiKeyCommand, *, user) -> ApiKeyResult:
        api_key, raw_key = self._api_key_creator(
            user=user,
            name=command.name,
            access_level=command.access_level,
        )
        return ApiKeyResult(api_key=api_key, raw_key=raw_key)


@dataclass(frozen=True)
class RevokeApiKeyCommand:
    api_key_id: int


class RevokeApiKeyUseCase:
    def __init__(self, *, api_key_revoker: ApiKeyRevoker):
        self._api_key_revoker = api_key_revoker

    def execute(self, command: RevokeApiKeyCommand, *, user):
        return self._api_key_revoker(user=user, api_key_id=command.api_key_id)
