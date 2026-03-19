"""Infrastructure helper for auth-related emails."""

import logging
from typing import Sequence

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

logger = logging.getLogger(__name__)


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
