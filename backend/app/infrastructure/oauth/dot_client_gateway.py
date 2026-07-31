"""django-oauth-toolkit backed implementation of OAuth gateways."""

from __future__ import annotations

from django.utils import timezone
from oauth2_provider.models import AccessToken

from app.domain.oauth.dto import AuthorizedTokenSummary
from app.domain.oauth.ports import OAuthAccessTokenGateway


class DOTOAuthAccessTokenGateway(OAuthAccessTokenGateway):
    """Inspect and revoke ``oauth2_provider.AccessToken`` rows."""

    def list_for_user(self, user_id: int) -> list[AuthorizedTokenSummary]:
        now = timezone.now()
        queryset = AccessToken.objects.filter(
            user_id=user_id, expires__gt=now
        ).select_related("application")
        return [
            AuthorizedTokenSummary(
                token_id=row.id,
                client_id=row.application.client_id if row.application else "",
                client_name=row.application.name if row.application else "",
                scope=row.scope or "",
                issued_at_iso=row.created.isoformat(),
                expires_at_iso=row.expires.isoformat() if row.expires else None,
            )
            for row in queryset.order_by("-created")
        ]

    def revoke_for_user(self, user_id: int, token_id: int) -> bool:
        deleted, _ = AccessToken.objects.filter(
            id=token_id, user_id=user_id
        ).delete()
        return bool(deleted)
