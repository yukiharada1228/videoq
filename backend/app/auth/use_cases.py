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


@dataclass(frozen=True)
class SignupResult:
    user_id: int


class SignupUserUseCase:
    def __init__(self, *, signup_user_creator: SignupUserCreator):
        self._signup_user_creator = signup_user_creator

    def execute(self, command: SignupCommand) -> SignupResult:
        user = self._signup_user_creator(command)
        return SignupResult(user_id=user.id)


@dataclass(frozen=True)
class VerifyEmailCommand:
    uid: str
    token: str


@dataclass(frozen=True)
class VerifyEmailResult:
    user_id: int
    is_active: bool


class VerifyEmailUseCase:
    def __init__(self, *, email_verification_resolver: EmailVerificationResolver):
        self._email_verification_resolver = email_verification_resolver

    def execute(self, command: VerifyEmailCommand) -> VerifyEmailResult:
        user = self._email_verification_resolver(command)
        return VerifyEmailResult(user_id=user.id, is_active=user.is_active)


@dataclass(frozen=True)
class PasswordResetRequestCommand:
    email: str


@dataclass(frozen=True)
class PasswordResetRequestResult:
    email_sent: bool


class RequestPasswordResetUseCase:
    def __init__(self, *, password_reset_requester: PasswordResetRequester):
        self._password_reset_requester = password_reset_requester

    def execute(self, command: PasswordResetRequestCommand) -> PasswordResetRequestResult:
        user = self._password_reset_requester(command)
        return PasswordResetRequestResult(email_sent=user is not None)


@dataclass(frozen=True)
class PasswordResetConfirmCommand:
    uid: str
    token: str
    new_password: str


@dataclass(frozen=True)
class PasswordResetConfirmResult:
    user_id: int


class ConfirmPasswordResetUseCase:
    def __init__(self, *, password_reset_resolver: PasswordResetResolver):
        self._password_reset_resolver = password_reset_resolver

    def execute(self, command: PasswordResetConfirmCommand) -> PasswordResetConfirmResult:
        user = self._password_reset_resolver(command)
        return PasswordResetConfirmResult(user_id=user.id)


@dataclass(frozen=True)
class DeleteAccountCommand:
    user_id: int
    reason: str


@dataclass(frozen=True)
class DeleteAccountResult:
    user_id: int


class DeleteAccountUseCase:
    def __init__(self, *, account_deactivator: AccountDeactivator):
        self._account_deactivator = account_deactivator

    def execute(self, command: DeleteAccountCommand) -> DeleteAccountResult:
        self._account_deactivator(command)
        return DeleteAccountResult(user_id=command.user_id)


@dataclass(frozen=True)
class GetCurrentUserQuery:
    user_id: int


@dataclass(frozen=True)
class CurrentUserResult:
    id: int
    username: str
    email: str
    video_limit: int | None
    video_count: int


class GetCurrentUserUseCase:
    def __init__(self, *, current_user_loader: CurrentUserLoader):
        self._current_user_loader = current_user_loader

    def execute(self, query: GetCurrentUserQuery) -> CurrentUserResult:
        user = self._current_user_loader(query)
        return CurrentUserResult(
            id=user.id,
            username=user.username,
            email=user.email,
            video_limit=user.video_limit,
            video_count=user.video_count,
        )


@dataclass(frozen=True)
class ApiKeyDetails:
    id: int
    name: str
    access_level: str
    prefix: str
    last_used_at: object
    created_at: object


@dataclass(frozen=True)
class ApiKeyResult:
    api_key: ApiKeyDetails
    raw_key: str


@dataclass(frozen=True)
class CreateApiKeyCommand:
    user_id: int
    name: str
    access_level: str


class CreateApiKeyUseCase:
    def __init__(self, *, api_key_creator: ApiKeyCreator):
        self._api_key_creator = api_key_creator

    def execute(self, command: CreateApiKeyCommand) -> ApiKeyResult:
        api_key, raw_key = self._api_key_creator(command)
        return ApiKeyResult(
            api_key=ApiKeyDetails(
                id=api_key.id,
                name=api_key.name,
                access_level=api_key.access_level,
                prefix=api_key.prefix,
                last_used_at=api_key.last_used_at,
                created_at=api_key.created_at,
            ),
            raw_key=raw_key,
        )


@dataclass(frozen=True)
class RevokeApiKeyCommand:
    user_id: int
    api_key_id: int


class RevokeApiKeyUseCase:
    def __init__(self, *, api_key_revoker: ApiKeyRevoker):
        self._api_key_revoker = api_key_revoker

    def execute(self, command: RevokeApiKeyCommand):
        return self._api_key_revoker(command)
