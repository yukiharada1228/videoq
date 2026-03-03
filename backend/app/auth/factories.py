from django.contrib.auth import get_user_model

from app.auth import repositories, services
from app.auth.use_cases import (ConfirmPasswordResetUseCase,
                                CreateApiKeyUseCase, DeleteAccountUseCase,
                                GetCurrentUserUseCase, ListApiKeysUseCase,
                                LoginUserUseCase, RefreshAccessTokenUseCase,
                                RequestPasswordResetUseCase,
                                RevokeApiKeyUseCase, SignupUserUseCase,
                                VerifyEmailUseCase)
from app.common.actors import DjangoActorLoader
from app.utils.email import send_email_verification, send_password_reset_email

User = get_user_model()
_actor_loader = DjangoActorLoader(User)


def _make_user_creator():
    def create(*, username, email, password):
        return services.create_signup_user(
            user_model=User,
            validated_data={
                "username": username,
                "email": email,
                "password": password,
            },
            send_verification_email=send_email_verification,
        )

    return create


def _make_email_verification_user_resolver():
    def resolve(*, uid, token):
        return services.resolve_email_verification_user(
            user_model=User,
            uid=uid,
            token=token,
        )

    return resolve


def _make_password_reset_email_sender():
    def send(*, email):
        return services.request_password_reset(
            user_model=User,
            email=email,
            send_reset_email=send_password_reset_email,
        )

    return send


def _make_password_reset_user_resolver():
    def resolve(*, uid, token, new_password):
        return services.resolve_password_reset_user(
            user_model=User,
            uid=uid,
            token=token,
            new_password=new_password,
        )

    return resolve


def _make_current_user_loader():
    def load(*, user_id):
        return repositories.get_user_with_video_count(
            user_model=User,
            user_id=user_id,
        )

    return load


def login_user_use_case() -> LoginUserUseCase:
    return LoginUserUseCase(
        credential_authenticator=services.authenticate_credentials,
        token_pair_issuer=services.create_token_pair,
    )


def refresh_access_token_use_case() -> RefreshAccessTokenUseCase:
    return RefreshAccessTokenUseCase(
        access_token_issuer=services.create_access_token,
    )


def signup_user_use_case() -> SignupUserUseCase:
    return SignupUserUseCase(
        user_creator=_make_user_creator(),
    )


def verify_email_use_case() -> VerifyEmailUseCase:
    return VerifyEmailUseCase(
        email_verification_user_resolver=_make_email_verification_user_resolver(),
        user_activator=services.activate_user,
    )


def request_password_reset_use_case() -> RequestPasswordResetUseCase:
    return RequestPasswordResetUseCase(
        password_reset_email_sender=_make_password_reset_email_sender(),
    )


def confirm_password_reset_use_case() -> ConfirmPasswordResetUseCase:
    return ConfirmPasswordResetUseCase(
        password_reset_user_resolver=_make_password_reset_user_resolver(),
        password_resetter=services.confirm_password_reset,
    )


def delete_account_use_case() -> DeleteAccountUseCase:
    return DeleteAccountUseCase(
        actor_loader=_actor_loader,
        account_deactivator=services.deactivate_user_account,
    )


def get_current_user_use_case() -> GetCurrentUserUseCase:
    return GetCurrentUserUseCase(
        current_user_loader=_make_current_user_loader(),
    )


def create_api_key_use_case() -> CreateApiKeyUseCase:
    return CreateApiKeyUseCase(
        actor_loader=_actor_loader,
        api_key_creator=services.create_integration_api_key,
    )


def revoke_api_key_use_case() -> RevokeApiKeyUseCase:
    return RevokeApiKeyUseCase(
        actor_loader=_actor_loader,
        api_key_revoker=services.revoke_active_api_key,
    )


def list_api_keys_use_case() -> ListApiKeysUseCase:
    return ListApiKeysUseCase(
        actor_loader=_actor_loader,
        api_keys_loader=repositories.get_active_api_keys,
    )
