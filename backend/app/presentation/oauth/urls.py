"""URL routing for the OAuth 2.1 authorization server.

Mounted at ``/api/oauth/`` by ``videoq/urls.py``. The well-known metadata
endpoints (RFC 8414 / RFC 9728) live at the host root and are mounted
separately in ``videoq/urls.py``.
"""

from django.urls import include, path
from oauth2_provider import urls as oauth2_urls

from app.dependencies import oauth as oauth_deps

from .authorize_view import CookieAuthorizationView
from .views import (
    AuthorizedTokenRevokeView,
    AuthorizedTokensListView,
    DynamicClientRegistrationView,
)

urlpatterns = [
    # Authorize endpoint — overridden so the consent step authenticates the
    # user via the VideoQ JWT cookie instead of a Django session. Must be
    # registered BEFORE ``include(oauth2_urls)`` so it wins the URL match.
    path(
        "authorize/",
        CookieAuthorizationView.as_view(),
        name="authorize",
    ),
    # django-oauth-toolkit core endpoints (token/revoke/introspect).
    # PKCE is enforced project-wide via ``OAUTH2_PROVIDER['PKCE_REQUIRED']``.
    path("", include(oauth2_urls)),
    # RFC 7591 Dynamic Client Registration. Anonymous so Claude Desktop /
    # claude.ai's built-in connector can register itself.
    path(
        "register/",
        DynamicClientRegistrationView.as_view(
            register_use_case=oauth_deps.get_register_oauth_client_use_case,
        ),
        name="oauth-register",
    ),
    # Per-user token management for the Settings UI.
    path(
        "tokens/",
        AuthorizedTokensListView.as_view(
            list_use_case=oauth_deps.get_list_authorized_tokens_use_case,
        ),
        name="oauth-tokens-list",
    ),
    path(
        "tokens/<int:token_id>/",
        AuthorizedTokenRevokeView.as_view(
            revoke_use_case=oauth_deps.get_revoke_authorized_token_use_case,
        ),
        name="oauth-tokens-revoke",
    ),
]
