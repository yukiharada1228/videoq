"""Auth context DI wiring.

Lifecycle policy:
- Repository/task gateway adapters are created per use-case resolution.
- Stateless auth adapters shared across use-cases are process-scoped via cache.
"""

from functools import lru_cache

from app.infrastructure.auth.api_key_resolver import DjangoApiKeyResolver
from app.infrastructure.auth.django_auth_gateway import DjangoUserAuthGateway
from app.infrastructure.auth.share_token_resolver import DjangoShareTokenResolver
from app.infrastructure.auth.simplejwt_gateway import SimpleJWTGateway
from app.infrastructure.repositories.django_account_deletion_repository import (
    DjangoAccountDeletionGateway,
)
from app.infrastructure.repositories.django_api_key_repository import DjangoApiKeyRepository
from app.infrastructure.repositories.django_user_auth_gateway import (
    DjangoEmailSenderGateway,
    DjangoUserManagementGateway,
)
from app.infrastructure.repositories.django_user_repository import DjangoUserRepository
from app.infrastructure.common.django_transaction import DjangoTransactionPort
from app.infrastructure.tasks.task_gateway import CeleryAuthTaskGateway
from app.use_cases.auth.authorize_api_key import AuthorizeApiKeyUseCase
from app.use_cases.auth.delete_account import AccountDeletionUseCase
from app.use_cases.auth.delete_account_data import DeleteAccountDataUseCase
from app.use_cases.auth.get_current_user import GetCurrentUserUseCase
from app.use_cases.auth.login import LoginUseCase
from app.use_cases.auth.logout import LogoutUseCase
from app.use_cases.auth.manage_api_keys import (
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
)
from app.use_cases.auth.refresh_token import RefreshTokenUseCase
from app.use_cases.auth.resolve_api_key import ResolveApiKeyUseCase
from app.use_cases.auth.resolve_share_token import ResolveShareTokenUseCase
from app.use_cases.auth.reset_password import (
    ConfirmPasswordResetUseCase,
    RequestPasswordResetUseCase,
)
from app.use_cases.auth.signup import SignupUserUseCase
from app.use_cases.auth.verify_email import VerifyEmailUseCase


def _new_user_auth_gateway() -> DjangoUserAuthGateway:
    return DjangoUserAuthGateway()


def _new_user_repository() -> DjangoUserRepository:
    return DjangoUserRepository()


def _new_user_management_gateway() -> DjangoUserManagementGateway:
    return DjangoUserManagementGateway()


def _new_email_sender_gateway() -> DjangoEmailSenderGateway:
    return DjangoEmailSenderGateway()


def _new_account_deletion_gateway() -> DjangoAccountDeletionGateway:
    return DjangoAccountDeletionGateway()


def _new_auth_task_gateway() -> CeleryAuthTaskGateway:
    return CeleryAuthTaskGateway()


def _new_api_key_repository() -> DjangoApiKeyRepository:
    return DjangoApiKeyRepository()


@lru_cache(maxsize=1)
def _get_simplejwt_gateway() -> SimpleJWTGateway:
    return SimpleJWTGateway()


@lru_cache(maxsize=1)
def _get_share_token_resolver() -> DjangoShareTokenResolver:
    return DjangoShareTokenResolver()


@lru_cache(maxsize=1)
def _get_api_key_resolver() -> DjangoApiKeyResolver:
    return DjangoApiKeyResolver()


@lru_cache(maxsize=1)
def _get_cookie_jwt_validator():
    from app.infrastructure.auth.cookie_jwt_validator import CookieJWTValidator

    return CookieJWTValidator()


def get_login_use_case() -> LoginUseCase:
    return LoginUseCase(_new_user_auth_gateway(), _get_simplejwt_gateway())


def get_refresh_token_use_case() -> RefreshTokenUseCase:
    return RefreshTokenUseCase(_get_simplejwt_gateway())


def get_logout_use_case() -> LogoutUseCase:
    return LogoutUseCase(_get_simplejwt_gateway())


def get_current_user_use_case() -> GetCurrentUserUseCase:
    return GetCurrentUserUseCase(_new_user_repository())


def get_signup_use_case() -> SignupUserUseCase:
    return SignupUserUseCase(_new_user_management_gateway(), _new_email_sender_gateway())


def get_verify_email_use_case() -> VerifyEmailUseCase:
    return VerifyEmailUseCase(_new_user_management_gateway())


def get_request_password_reset_use_case() -> RequestPasswordResetUseCase:
    return RequestPasswordResetUseCase(
        _new_user_management_gateway(),
        _new_email_sender_gateway(),
    )


def get_confirm_password_reset_use_case() -> ConfirmPasswordResetUseCase:
    return ConfirmPasswordResetUseCase(_new_user_management_gateway())


def get_delete_account_use_case() -> AccountDeletionUseCase:
    return AccountDeletionUseCase(
        _new_account_deletion_gateway(),
        _new_auth_task_gateway(),
        DjangoTransactionPort(),
    )


def get_delete_account_data_use_case() -> DeleteAccountDataUseCase:
    from app.infrastructure.repositories.django_user_data_deletion_gateway import (
        DjangoUserDataDeletionGateway,
    )

    return DeleteAccountDataUseCase(DjangoUserDataDeletionGateway())


def get_list_api_keys_use_case() -> ListApiKeysUseCase:
    return ListApiKeysUseCase(_new_api_key_repository())


def get_create_api_key_use_case() -> CreateApiKeyUseCase:
    return CreateApiKeyUseCase(_new_api_key_repository())


def get_revoke_api_key_use_case() -> RevokeApiKeyUseCase:
    return RevokeApiKeyUseCase(_new_api_key_repository())


def get_authorize_api_key_use_case() -> AuthorizeApiKeyUseCase:
    return AuthorizeApiKeyUseCase()


def get_resolve_share_token_use_case() -> ResolveShareTokenUseCase:
    return ResolveShareTokenUseCase(_get_share_token_resolver())


def get_resolve_api_key_use_case() -> ResolveApiKeyUseCase:
    return ResolveApiKeyUseCase(_get_api_key_resolver())


def get_cookie_jwt_validator():
    return _get_cookie_jwt_validator()
