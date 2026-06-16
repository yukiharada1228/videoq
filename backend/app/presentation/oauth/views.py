"""HTTP views for the OAuth 2.1 authorization server."""

from __future__ import annotations

import json
import logging
from typing import Any

from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.presentation.common.authentication import CookieJWTAuthentication
from app.presentation.common.mixins import DependencyResolverMixin

from .metadata import authorization_server_metadata, protected_resource_metadata

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name="dispatch")
class AuthorizationServerMetadataView(View):
    """RFC 8414 ``/.well-known/oauth-authorization-server`` document."""

    def get(self, request, *args, **kwargs):
        return JsonResponse(authorization_server_metadata())


@method_decorator(csrf_exempt, name="dispatch")
class ProtectedResourceMetadataView(View):
    """RFC 9728 ``/.well-known/oauth-protected-resource`` document."""

    def get(self, request, *args, **kwargs):
        return JsonResponse(protected_resource_metadata("/api/mcp/"))


@method_decorator(csrf_exempt, name="dispatch")
class DynamicClientRegistrationView(DependencyResolverMixin, View):
    """RFC 7591 client registration endpoint. Anonymous: anyone can register."""

    # Injected via as_view(...)
    register_use_case = None

    def post(self, request, *args, **kwargs):
        body: bytes = request.body or b""
        try:
            payload: Any = json.loads(body.decode("utf-8")) if body else {}
        except (ValueError, UnicodeDecodeError):
            return JsonResponse(
                {
                    "error": "invalid_client_metadata",
                    "error_description": "Body must be valid UTF-8 JSON",
                },
                status=400,
            )

        use_case = self.resolve_dependency(self.register_use_case)
        try:
            registered = use_case.execute(payload)
        except Exception as exc:  # noqa: BLE001 - convert to OAuth error
            from app.use_cases.oauth.exceptions import InvalidClientMetadata

            if isinstance(exc, InvalidClientMetadata):
                return JsonResponse(
                    {
                        "error": exc.error,
                        "error_description": exc.description or str(exc),
                    },
                    status=400,
                )
            logger.exception("Unexpected error during DCR")
            return JsonResponse(
                {
                    "error": "server_error",
                    "error_description": "Failed to register client",
                },
                status=500,
            )

        response_payload: dict[str, Any] = {
            "client_id": registered.client_id,
            "client_id_issued_at": registered.client_id_issued_at,
            "redirect_uris": registered.redirect_uris,
            "grant_types": registered.grant_types,
            "response_types": registered.response_types,
            "token_endpoint_auth_method": registered.token_endpoint_auth_method,
        }
        if registered.client_secret is not None:
            response_payload["client_secret"] = registered.client_secret
        if registered.client_name is not None:
            response_payload["client_name"] = registered.client_name
        if registered.scope is not None:
            response_payload["scope"] = registered.scope
        return JsonResponse(response_payload, status=status.HTTP_201_CREATED)


class AuthorizedTokensListView(DependencyResolverMixin, APIView):
    """List OAuth tokens the authenticated user has authorized."""

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    list_use_case = None

    def get(self, request, *args, **kwargs):
        use_case = self.resolve_dependency(self.list_use_case)
        tokens = use_case.execute(request.user.id)
        return Response(
            {
                "tokens": [
                    {
                        "id": t.token_id,
                        "client_id": t.client_id,
                        "client_name": t.client_name,
                        "scope": t.scope,
                        "issued_at": t.issued_at_iso,
                        "expires_at": t.expires_at_iso,
                    }
                    for t in tokens
                ]
            }
        )


class AuthorizedTokenRevokeView(DependencyResolverMixin, APIView):
    """Revoke a single OAuth token belonging to the authenticated user."""

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    revoke_use_case = None

    def delete(self, request, token_id: int, *args, **kwargs):
        use_case = self.resolve_dependency(self.revoke_use_case)
        ok = use_case.execute(request.user.id, int(token_id))
        if not ok:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
