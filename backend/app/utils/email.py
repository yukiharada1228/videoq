import logging
from typing import Sequence

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

logger = logging.getLogger(__name__)

User = get_user_model()


def build_email_verification_link(user: User) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000")
    return f"{frontend_url}/verify-email?uid={uid}&token={token}"


def send_email_verification(user: User) -> None:
    """
    Send an email verification mail to the specified user.
    """
    subject = "[Ask Video] 仮登録完了のお知らせ"
    verification_link = build_email_verification_link(user)
    message_lines: Sequence[str] = [
        "Ask Video にご登録いただきありがとうございます。",
        "以下のURLをクリックして、本登録を完了してください。",
        "",
        verification_link,
    ]
    message = "\n".join(message_lines)
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "noreply@askvideo.local")
    recipient_list = [user.email]
    try:
        send_mail(subject, message, from_email, recipient_list, fail_silently=False)
    except Exception:
        logger.exception("Failed to send verification email to %s", user.email)
        raise
