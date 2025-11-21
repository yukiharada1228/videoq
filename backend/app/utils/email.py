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
    """
    Send an email verification mail to the specified user.
    """
    subject = "[TalkVid] Temporary Registration Complete"
    verification_link = build_email_verification_link(user)
    message_lines: Sequence[str] = [
        "Thank you for registering with TalkVid.",
        "Please click the following URL to complete your registration.",
        "",
        verification_link,
    ]
    message = "\n".join(message_lines)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@talkvideo.local")
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
    subject = "[TalkVid] Password Reset Instructions"
    reset_link = build_password_reset_link(user)
    message_lines: Sequence[str] = [
        "We have received a password reset request for TalkVid.",
        "Please set a new password from the following URL within 24 hours.",
        "",
        reset_link,
        "",
        "If you did not request this, please ignore this email.",
    ]
    message = "\n".join(message_lines)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@talkvideo.local")
    recipient_list = [user.email]
    try:
        send_mail(subject, message, from_email, recipient_list, fail_silently=False)
    except Exception:
        logger.exception("Failed to send password reset email to %s", user.email)
        raise
