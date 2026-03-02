from typing import Protocol


class CredentialAuthenticator(Protocol):
    def __call__(self, *, username: str, password: str): ...


class TokenPairIssuer(Protocol):
    def __call__(self, *, user) -> dict[str, str]: ...


class AccessTokenIssuer(Protocol):
    def __call__(self, *, refresh_token: str) -> str: ...


class SignupUserCreator(Protocol):
    def __call__(self, command): ...


class EmailVerificationResolver(Protocol):
    def __call__(self, command): ...


class UserActivator(Protocol):
    def __call__(self, user): ...


class PasswordResetRequester(Protocol):
    def __call__(self, command): ...


class PasswordResetResolver(Protocol):
    def __call__(self, command): ...


class PasswordResetConfirmer(Protocol):
    def __call__(self, *, user, new_password: str): ...


class AccountDeactivator(Protocol):
    def __call__(self, command): ...


class CurrentUserLoader(Protocol):
    def __call__(self, query): ...


class ApiKeyCreator(Protocol):
    def __call__(self, command): ...


class ApiKeyRevoker(Protocol):
    def __call__(self, command): ...
