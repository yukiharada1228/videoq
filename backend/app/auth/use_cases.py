from dataclasses import dataclass

from app.auth.ports import (AccessTokenIssuer, AccountDeactivator,
                            ActiveApiKeyRevoker, ActiveApiKeysLoader,
                            ActorLoader, CredentialAuthenticator,
                            CurrentUserWithVideoCountLoader,
                            EmailVerificationUserResolver,
                            IntegrationApiKeyCreator, PasswordResetEmailSender,
                            PasswordResetter, PasswordResetUserResolver,
                            TokenPairIssuer, UserActivator, UserCreator)


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
    def __init__(self, *, user_creator: UserCreator):
        self._user_creator = user_creator

    def execute(self, command: SignupCommand) -> SignupResult:
        user = self._user_creator(
            username=command.username,
            email=command.email,
            password=command.password,
        )
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
    def __init__(
        self,
        *,
        email_verification_user_resolver: EmailVerificationUserResolver,
        user_activator: UserActivator,
    ):
        self._email_verification_user_resolver = email_verification_user_resolver
        self._user_activator = user_activator

    def execute(self, command: VerifyEmailCommand) -> VerifyEmailResult:
        user = self._email_verification_user_resolver(
            uid=command.uid,
            token=command.token,
        )
        user = self._user_activator(user)
        return VerifyEmailResult(user_id=user.id, is_active=user.is_active)


@dataclass(frozen=True)
class PasswordResetRequestCommand:
    email: str


@dataclass(frozen=True)
class PasswordResetRequestResult:
    email_sent: bool


class RequestPasswordResetUseCase:
    def __init__(self, *, password_reset_email_sender: PasswordResetEmailSender):
        self._password_reset_email_sender = password_reset_email_sender

    def execute(
        self, command: PasswordResetRequestCommand
    ) -> PasswordResetRequestResult:
        result = self._password_reset_email_sender(email=command.email)
        return PasswordResetRequestResult(email_sent=result is not None)


@dataclass(frozen=True)
class PasswordResetConfirmCommand:
    uid: str
    token: str
    new_password: str


@dataclass(frozen=True)
class PasswordResetConfirmResult:
    user_id: int


class ConfirmPasswordResetUseCase:
    def __init__(
        self,
        *,
        password_reset_user_resolver: PasswordResetUserResolver,
        password_resetter: PasswordResetter,
    ):
        self._password_reset_user_resolver = password_reset_user_resolver
        self._password_resetter = password_resetter

    def execute(
        self, command: PasswordResetConfirmCommand
    ) -> PasswordResetConfirmResult:
        user = self._password_reset_user_resolver(
            uid=command.uid,
            token=command.token,
            new_password=command.new_password,
        )
        self._password_resetter(user=user, new_password=command.new_password)
        return PasswordResetConfirmResult(user_id=user.id)


@dataclass(frozen=True)
class DeleteAccountCommand:
    actor_id: int
    reason: str


@dataclass(frozen=True)
class DeleteAccountResult:
    user_id: int


class DeleteAccountUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        account_deactivator: AccountDeactivator,
    ):
        self._actor_loader = actor_loader
        self._account_deactivator = account_deactivator

    def execute(self, command: DeleteAccountCommand) -> DeleteAccountResult:
        user = self._actor_loader(command.actor_id)
        self._account_deactivator(user=user, reason=command.reason)
        return DeleteAccountResult(user_id=command.actor_id)


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
    def __init__(self, *, current_user_loader: CurrentUserWithVideoCountLoader):
        self._current_user_loader = current_user_loader

    def execute(self, query: GetCurrentUserQuery) -> CurrentUserResult:
        user = self._current_user_loader(user_id=query.user_id)
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
    actor_id: int
    name: str
    access_level: str


class CreateApiKeyUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        api_key_creator: IntegrationApiKeyCreator,
    ):
        self._actor_loader = actor_loader
        self._api_key_creator = api_key_creator

    def execute(self, command: CreateApiKeyCommand) -> ApiKeyResult:
        user = self._actor_loader(command.actor_id)
        api_key, raw_key = self._api_key_creator(
            user=user,
            name=command.name,
            access_level=command.access_level,
        )
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
    actor_id: int
    api_key_id: int


class RevokeApiKeyUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        api_key_revoker: ActiveApiKeyRevoker,
    ):
        self._actor_loader = actor_loader
        self._api_key_revoker = api_key_revoker

    def execute(self, command: RevokeApiKeyCommand):
        user = self._actor_loader(command.actor_id)
        return self._api_key_revoker(user=user, api_key_id=command.api_key_id)


@dataclass(frozen=True)
class ListApiKeysQuery:
    actor_id: int


class ListApiKeysUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        api_keys_loader: ActiveApiKeysLoader,
    ):
        self._actor_loader = actor_loader
        self._api_keys_loader = api_keys_loader

    def execute(self, query: ListApiKeysQuery):
        user = self._actor_loader(query.actor_id)
        return self._api_keys_loader(user=user)
