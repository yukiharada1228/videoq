"""Infrastructure helper for auth-related emails."""

import logging
from typing import Sequence

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser
from django.contrib.auth.tokens import (
    PasswordResetTokenGenerator,
    default_token_generator,
)
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

logger = logging.getLogger(__name__)


class EmailChangeTokenGenerator(PasswordResetTokenGenerator):
    """Token generator that is invalidated when pending_email changes."""

    def _make_hash_value(self, user: AbstractBaseUser, timestamp: int) -> str:
        pending_email = getattr(user, "pending_email", "") or ""
        current_email = getattr(user, "email", "") or ""
        login_timestamp = (
            ""
            if user.last_login is None
            else user.last_login.replace(microsecond=0, tzinfo=None)
        )
        return (
            f"{user.pk}{user.password}{login_timestamp}"
            f"{timestamp}{current_email}{pending_email}"
        )


email_change_token_generator = EmailChangeTokenGenerator()


def build_email_verification_link(user: AbstractBaseUser) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    return f"{frontend_url}/verify-email?uid={uid}&token={token}"


def send_email_verification(user: AbstractBaseUser) -> None:
    """Send an email verification mail to the specified user."""
    subject = "[VideoQ] 仮登録が完了しました"
    verification_link = build_email_verification_link(user)
    message_lines: Sequence[str] = [
        "VideoQ へのご登録ありがとうございます。",
        "以下のURLをクリックして、本登録を完了させてください。",
        "",
        verification_link,
    ]
    message = "\n".join(message_lines)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@videoq.local")
    recipient_list = [user.email]
    try:
        send_mail(subject, message, from_email, recipient_list, fail_silently=False)
    except Exception:
        logger.exception("Failed to send verification email to %s", user.email)
        raise


def build_password_reset_link(user: AbstractBaseUser) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    return f"{frontend_url}/reset-password?uid={uid}&token={token}"


def send_password_reset_email(user: AbstractBaseUser) -> None:
    subject = "[VideoQ] パスワード再設定のご案内"
    reset_link = build_password_reset_link(user)
    message_lines: Sequence[str] = [
        "VideoQ のパスワード再設定リクエストを受け付けました。",
        "24時間以内に、以下のURLから新しいパスワードを設定してください。",
        "",
        reset_link,
        "",
        "もしこのリクエストに心当たりがない場合は、このメールを破棄してください。",
    ]
    message = "\n".join(message_lines)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@videoq.local")
    recipient_list = [user.email]
    try:
        send_mail(subject, message, from_email, recipient_list, fail_silently=False)
    except Exception:
        logger.exception("Failed to send password reset email to %s", user.email)
        raise


def build_email_change_confirmation_link(user: AbstractBaseUser) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = email_change_token_generator.make_token(user)
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    return f"{frontend_url}/change-email?uid={uid}&token={token}"


def send_email_change_confirmation(user: AbstractBaseUser) -> None:
    pending_email = getattr(user, "pending_email", None)
    if not pending_email:
        raise ValueError("User has no pending email address.")

    subject = "[VideoQ] メールアドレス変更の確認"
    confirmation_link = build_email_change_confirmation_link(user)
    message_lines: Sequence[str] = [
        "VideoQ のメールアドレス変更リクエストを受け付けました。",
        "以下のURLをクリックして、新しいメールアドレスへの変更を完了してください。",
        "",
        confirmation_link,
        "",
        "もしこのリクエストに心当たりがない場合は、このメールを破棄してください。",
    ]
    message = "\n".join(message_lines)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@videoq.local")
    recipient_list = [pending_email]
    try:
        send_mail(subject, message, from_email, recipient_list, fail_silently=False)
    except Exception:
        logger.exception("Failed to send email change confirmation to %s", pending_email)
        raise
