"""
Django implementation of the UserAuthGateway port.
Wraps django.contrib.auth.authenticate so credential logic stays in infrastructure.
"""

from typing import Optional

from django.contrib.auth import authenticate

from app.domain.auth.ports import UserAuthGateway


class DjangoUserAuthGateway(UserAuthGateway):
    """Authenticates users via Django's built-in authentication backend."""

    def authenticate(self, username: str, password: str) -> Optional[int]:
        user = authenticate(username=username, password=password)
        if user is None:
            return None
        return user.pk
