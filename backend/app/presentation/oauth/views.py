"""HTTP views for the OAuth 2.1 authorization server."""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.presentation.common.authentication import CookieJWTAuthentication
from app.presentation.common.mixins import DependencyResolverMixin

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
