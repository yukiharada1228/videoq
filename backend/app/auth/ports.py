from typing import Protocol

from app.common.ports import ActorLoader  # noqa: F401 – re-exported


class CredentialAuthenticator(Protocol):
    def __call__(self, *, username: str, password: str): ...


class TokenPairIssuer(Protocol):
    def __call__(self, *, user) -> dict[str, str]: ...


class AccessTokenIssuer(Protocol):
    def __call__(self, *, refresh_token: str) -> str: ...


class UserCreator(Protocol):
    def __call__(self, *, username: str, email: str, password: str): ...


class EmailVerificationUserResolver(Protocol):
    def __call__(self, *, uid: str, token: str): ...


class UserActivator(Protocol):
    def __call__(self, user): ...


class PasswordResetEmailSender(Protocol):
    def __call__(self, *, email: str): ...


class PasswordResetUserResolver(Protocol):
    def __call__(self, *, uid: str, token: str, new_password: str): ...


class PasswordResetter(Protocol):
    def __call__(self, *, user, new_password: str): ...


class AccountDeactivator(Protocol):
    def __call__(self, *, user, reason: str): ...


class CurrentUserWithVideoCountLoader(Protocol):
    def __call__(self, *, user_id: int): ...


class IntegrationApiKeyCreator(Protocol):
    def __call__(self, *, user, name: str, access_level: str): ...


class ActiveApiKeyRevoker(Protocol):
    def __call__(self, *, user, api_key_id: int): ...


class ActiveApiKeysLoader(Protocol):
    def __call__(self, *, user): ...
