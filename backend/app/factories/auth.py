"""
Auth bounded context factories.
Constructs fully-wired auth and API key use case instances.
"""

from app.infrastructure.auth.django_auth_gateway import DjangoUserAuthGateway
from app.infrastructure.auth.simplejwt_gateway import SimpleJWTGateway
from app.infrastructure.auth.api_key_resolver import DjangoApiKeyResolver
from app.infrastructure.auth.share_token_resolver import DjangoShareTokenResolver
from app.infrastructure.repositories.django_account_deletion_repository import (
    DjangoAccountDeletionGateway,
)
from app.infrastructure.repositories.django_api_key_repository import DjangoApiKeyRepository
from app.infrastructure.repositories.django_user_auth_gateway import (
    DjangoEmailSenderGateway,
    DjangoUserManagementGateway,
)
from app.infrastructure.repositories.django_user_repository import DjangoUserRepository
from app.infrastructure.tasks.task_gateway import CeleryAuthTaskGateway
from app.use_cases.auth.delete_account import AccountDeletionUseCase
from app.use_cases.auth.delete_account_data import DeleteAccountDataUseCase
from app.use_cases.auth.get_current_user import GetCurrentUserUseCase
from app.use_cases.auth.login import LoginUseCase
from app.use_cases.auth.manage_api_keys import (
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
)
from app.use_cases.auth.authorize_api_key import AuthorizeApiKeyUseCase
from app.use_cases.auth.refresh_token import RefreshTokenUseCase
from app.use_cases.auth.resolve_api_key import ResolveApiKeyUseCase
from app.use_cases.auth.resolve_share_token import ResolveShareTokenUseCase
from app.use_cases.auth.reset_password import (
    ConfirmPasswordResetUseCase,
    RequestPasswordResetUseCase,
)
from app.use_cases.auth.signup import SignupUserUseCase
from app.use_cases.auth.verify_email import VerifyEmailUseCase


def get_login_use_case() -> LoginUseCase:
    return LoginUseCase(DjangoUserAuthGateway(), SimpleJWTGateway())


def get_refresh_token_use_case() -> RefreshTokenUseCase:
    return RefreshTokenUseCase(SimpleJWTGateway())


def get_current_user_use_case() -> GetCurrentUserUseCase:
    return GetCurrentUserUseCase(DjangoUserRepository())


def get_signup_use_case() -> SignupUserUseCase:
    return SignupUserUseCase(DjangoUserManagementGateway(), DjangoEmailSenderGateway())


def get_verify_email_use_case() -> VerifyEmailUseCase:
    return VerifyEmailUseCase(DjangoUserManagementGateway())


def get_request_password_reset_use_case() -> RequestPasswordResetUseCase:
    return RequestPasswordResetUseCase(
        DjangoUserManagementGateway(), DjangoEmailSenderGateway()
    )


def get_confirm_password_reset_use_case() -> ConfirmPasswordResetUseCase:
    return ConfirmPasswordResetUseCase(DjangoUserManagementGateway())


def get_delete_account_use_case() -> AccountDeletionUseCase:
    return AccountDeletionUseCase(
        DjangoAccountDeletionGateway(),
        CeleryAuthTaskGateway(),
    )


def get_delete_account_data_use_case() -> DeleteAccountDataUseCase:
    from app.infrastructure.repositories.django_user_data_deletion_gateway import (
        DjangoUserDataDeletionGateway,
    )

    return DeleteAccountDataUseCase(DjangoUserDataDeletionGateway())


def get_list_api_keys_use_case() -> ListApiKeysUseCase:
    return ListApiKeysUseCase(DjangoApiKeyRepository())


def get_create_api_key_use_case() -> CreateApiKeyUseCase:
    return CreateApiKeyUseCase(DjangoApiKeyRepository())


def get_revoke_api_key_use_case() -> RevokeApiKeyUseCase:
    return RevokeApiKeyUseCase(DjangoApiKeyRepository())


def get_authorize_api_key_use_case() -> AuthorizeApiKeyUseCase:
    return AuthorizeApiKeyUseCase()


def get_resolve_share_token_use_case() -> ResolveShareTokenUseCase:
    return ResolveShareTokenUseCase(DjangoShareTokenResolver())


def get_resolve_api_key_use_case() -> ResolveApiKeyUseCase:
    return ResolveApiKeyUseCase(DjangoApiKeyResolver())
