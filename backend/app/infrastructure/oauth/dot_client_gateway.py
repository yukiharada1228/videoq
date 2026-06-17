"""django-oauth-toolkit backed implementation of OAuth gateways."""

from __future__ import annotations

from typing import cast

from django.utils import timezone
from oauth2_provider.generators import generate_client_secret
from oauth2_provider.models import (
    AccessToken,
    Application,
    get_application_model,
)

from app.domain.oauth.dto import (
    AuthorizedTokenSummary,
    ClientRegistrationRequest,
    ClientRegistrationResponse,
)
from app.domain.oauth.ports import OAuthAccessTokenGateway, OAuthClientGateway


class DOTOAuthClientGateway(OAuthClientGateway):
    """Persist OAuth clients as ``oauth2_provider.Application`` rows."""

    def register(
        self, request: ClientRegistrationRequest
    ) -> ClientRegistrationResponse:
        ApplicationModel = cast(type[Application], get_application_model())

        if request.token_endpoint_auth_method == "none":
            client_type = ApplicationModel.CLIENT_PUBLIC
        else:
            client_type = ApplicationModel.CLIENT_CONFIDENTIAL

        # django-oauth-toolkit hashes Application.client_secret on save when
        # HASH_CLIENT_SECRET=True (default since 2.4). If we let create()
        # auto-generate the secret and then read ``application.client_secret``,
        # we get the PBKDF2 hash, not the plaintext, which we then leak to the
        # client. The client stores the hash as its credential, sends it back
        # on /api/oauth/token/, DOT re-hashes it, no match → invalid_client.
        # Generate the plaintext ourselves and let save() hash it on the way in.
        plaintext_secret: str | None
        if client_type == ApplicationModel.CLIENT_CONFIDENTIAL:
            plaintext_secret = generate_client_secret()
        else:
            plaintext_secret = None

        application: Application = ApplicationModel.objects.create(
            name=request.client_name or "MCP Client",
            client_type=client_type,
            authorization_grant_type=(
                ApplicationModel.GRANT_AUTHORIZATION_CODE
            ),
            redirect_uris=" ".join(request.redirect_uris),
            # PKCE is required project-wide via OAUTH2_PROVIDER.PKCE_REQUIRED;
            # public clients use PKCE in place of a client_secret.
            client_secret=plaintext_secret or "",
            skip_authorization=False,
        )

        if client_type != ApplicationModel.CLIENT_CONFIDENTIAL:
            # Public clients must not present a usable secret. Re-save with an
            # empty secret so DOT's authenticate_client_id path is the only way
            # to authenticate this client.
            application.client_secret = ""
            application.save(update_fields=["client_secret"])

        return ClientRegistrationResponse(
            client_id=application.client_id,
            client_secret=plaintext_secret,
            redirect_uris=request.redirect_uris,
            grant_types=request.grant_types,
            response_types=request.response_types,
            token_endpoint_auth_method=request.token_endpoint_auth_method,
            client_name=request.client_name,
            scope=request.scope,
            client_id_issued_at=int(application.created.timestamp()),
        )


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
