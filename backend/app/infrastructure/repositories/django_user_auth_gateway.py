"""
Infrastructure implementations of UserManagementGateway and EmailSenderGateway.
"""

from typing import Optional

from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway


class DjangoUserManagementGateway(UserManagementGateway):
    """Implements UserManagementGateway using Django's auth system."""

    def _get_user_model(self):
        from django.contrib.auth import get_user_model
        return get_user_model()

    def email_exists(self, email: str) -> bool:
        User = self._get_user_model()
        return User.objects.filter(email__iexact=email).exists()

    def create_inactive_user(self, username: str, email: str, password: str) -> int:
        from django.db import transaction
        User = self._get_user_model()
        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                is_active=False,
            )
        return user.id

    def activate_user(self, user_id: int) -> None:
        User = self._get_user_model()
        User.objects.filter(pk=user_id, is_active=False).update(is_active=True)

    def get_user_id_by_uid_token(self, uidb64: str, token: str) -> Optional[int]:
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_str
        from django.utils.http import urlsafe_base64_decode

        User = self._get_user_model()
        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return None
        if not default_token_generator.check_token(user, token):
            return None
        return user.id

    def find_active_user_id_by_email(self, email: str) -> Optional[int]:
        User = self._get_user_model()
        user = (
            User.objects.filter(email__iexact=email, is_active=True)
            .order_by("id")
            .first()
        )
        return user.id if user else None

    def set_password(self, user_id: int, new_password: str) -> None:
        User = self._get_user_model()
        user = User.objects.get(pk=user_id)
        user.set_password(new_password)
        user.save(update_fields=["password"])


class DjangoEmailSenderGateway(EmailSenderGateway):
    """Implements EmailSenderGateway by delegating to existing email utils."""

    def send_verification(self, user_id: int) -> None:
        from django.contrib.auth import get_user_model
        from app.infrastructure.common.email import send_email_verification
        User = get_user_model()
        user = User.objects.get(pk=user_id)
        send_email_verification(user)

    def send_password_reset(self, user_id: int) -> None:
        from django.contrib.auth import get_user_model
        from app.infrastructure.common.email import send_password_reset_email
        User = get_user_model()
        user = User.objects.get(pk=user_id)
        send_password_reset_email(user)
