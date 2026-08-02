"""Drop-in replacement for django-oauth-toolkit's ``AuthorizationView``.

DOT's view inherits from ``LoginRequiredMixin`` which expects a Django
session-backed user. VideoQ uses an HTTP-only JWT cookie (validated by
``CookieJWTValidator``) instead of sessions, so before DOT's view runs we
populate ``request.user`` from the cookie. If the cookie is missing or
invalid the user is redirected to the SPA login page with a ``next=`` query
parameter so they can return to the consent screen after signing in.
"""

from __future__ import annotations

from urllib.parse import quote, urlparse

from django.conf import settings
from django.http import HttpResponseRedirect
from oauth2_provider.views.base import AuthorizationView

from app.dependencies.common import get_cookie_jwt_validator


class CookieAuthorizationView(AuthorizationView):
    """Authorize endpoint that authenticates via the JWT cookie."""

    def dispatch(self, request, *args, **kwargs):
        if not getattr(request.user, "is_authenticated", False):
            raw_token = request.COOKIES.get("access_token")
            if raw_token:
                validator = get_cookie_jwt_validator()
                validated = validator.validate_raw_token(raw_token)
                if validated is not None:
                    user, _ = validated
                    request.user = user

        if not getattr(request.user, "is_authenticated", False):
            return self._redirect_to_login(request)

        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Surface the redirect_uri's host so the consent UI can show users
        # *where* they're about to be sent. Without this the screen only
        # shows the (attacker-controlled, DCR-supplied) client_name.
        redirect_uri = None
        form = context.get("form")
        if form is not None:
            initial = getattr(form, "initial", None) or {}
            redirect_uri = initial.get("redirect_uri")
            if not redirect_uri:
                bound = form.data.get("redirect_uri") if hasattr(form, "data") else None
                redirect_uri = bound
        if not redirect_uri:
            application = context.get("application")
            if application is not None:
                redirect_uri = getattr(application, "default_redirect_uri", None)
        if redirect_uri:
            try:
                context["redirect_uri_host"] = (
                    urlparse(redirect_uri).hostname or redirect_uri
                )
            except ValueError:
                context["redirect_uri_host"] = redirect_uri
        return context

    @staticmethod
    def _redirect_to_login(request) -> HttpResponseRedirect:
        frontend = getattr(settings, "FRONTEND_URL", "").rstrip("/")
        next_url = request.get_full_path()
        login_url = f"{frontend}/login?next={quote(next_url, safe='')}"
        return HttpResponseRedirect(login_url)
