"""Integration tests for the OAuth 2.1 authorization server endpoints.

Covers the MCP Authorization spec contract: well-known metadata documents,
Dynamic Client Registration (RFC 7591), the WWW-Authenticate challenge on
unauthenticated MCP calls, and access-token validation against the MCP
endpoint. Together these guarantee that Claude Desktop / claude.ai's
built-in Remote MCP connector can discover, register, authorize, and call
``/api/mcp/`` without any out-of-band configuration.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from oauth2_provider.models import (
    AccessToken,
    Application,
    Grant,
    RefreshToken,
    get_application_model,
)
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()
ApplicationModel = get_application_model()


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


@override_settings(OAUTH2_PROVIDER_ISSUER_URL="http://testserver")
class WellKnownMetadataTests(TestCase):
    def test_authorization_server_metadata(self):
        resp = self.client.get("/.well-known/oauth-authorization-server")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["issuer"], "http://testserver")
        self.assertEqual(
            body["authorization_endpoint"],
            "http://testserver/api/oauth/authorize/",
        )
        self.assertEqual(
            body["token_endpoint"],
            "http://testserver/api/oauth/token/",
        )
        self.assertEqual(
            body["registration_endpoint"],
            "http://testserver/api/oauth/register/",
        )
        self.assertIn("S256", body["code_challenge_methods_supported"])
        self.assertIn("authorization_code", body["grant_types_supported"])
        self.assertIn("read", body["scopes_supported"])

    def test_protected_resource_metadata(self):
        resp = self.client.get("/.well-known/oauth-protected-resource/api/mcp")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["resource"], "http://testserver/api/mcp/")
        self.assertIn("http://testserver", body["authorization_servers"])

    def test_protected_resource_metadata_also_served_at_bare_path(self):
        # Claude.ai's Remote MCP connector probes the bare
        # ``/.well-known/oauth-protected-resource`` path in addition to the
        # path-concatenated form. A 404 there causes the connector to
        # abort discovery before opening the authorize URL.
        resp = self.client.get("/.well-known/oauth-protected-resource")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["resource"], "http://testserver/api/mcp/")
        self.assertIn("http://testserver", body["authorization_servers"])


@override_settings(OAUTH2_PROVIDER_ISSUER_URL="http://testserver")
class DynamicClientRegistrationTests(TestCase):
    def test_registers_public_client_with_pkce(self):
        body = {
            "redirect_uris": ["http://127.0.0.1:33418/callback"],
            "client_name": "Claude Desktop",
            "token_endpoint_auth_method": "none",
        }
        resp = self.client.post(
            "/api/oauth/register/",
            data=json.dumps(body),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        payload = resp.json()
        self.assertIn("client_id", payload)
        self.assertNotIn("client_secret", payload)
        self.assertEqual(payload["token_endpoint_auth_method"], "none")
        # Persisted with the matching client_type.
        app = ApplicationModel.objects.get(client_id=payload["client_id"])
        self.assertEqual(app.client_type, ApplicationModel.CLIENT_PUBLIC)

    def test_rejects_non_localhost_http_redirect(self):
        body = {
            "redirect_uris": ["http://example.com/callback"],
            "client_name": "Bad",
        }
        resp = self.client.post(
            "/api/oauth/register/",
            data=json.dumps(body),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["error"], "invalid_redirect_uri")

    def test_rejects_missing_redirect_uris(self):
        resp = self.client.post(
            "/api/oauth/register/",
            data=json.dumps({"client_name": "no-redirect"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_rejects_unknown_scope(self):
        body = {
            "redirect_uris": ["http://127.0.0.1/cb"],
            "scope": "read admin",
        }
        resp = self.client.post(
            "/api/oauth/register/",
            data=json.dumps(body),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)


@override_settings(OAUTH2_PROVIDER_ISSUER_URL="http://testserver")
class MCPBearerAuthTests(TestCase):
    """The MCP endpoint must accept OAuth tokens and advertise discovery."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="oauth-mcp",
            email="oauth-mcp@example.com",
            password="testpw123",
        )
        self.client = APIClient()

    def _create_oauth_app(self) -> Application:
        return ApplicationModel.objects.create(
            name="Test client",
            user=None,
            client_type=ApplicationModel.CLIENT_PUBLIC,
            authorization_grant_type=ApplicationModel.GRANT_AUTHORIZATION_CODE,
            redirect_uris="http://127.0.0.1/cb",
            client_secret="",
        )

    def _issue_token(self, scope: str = "read") -> str:
        from django.utils import timezone
        from datetime import timedelta

        app = self._create_oauth_app()
        token_value = secrets.token_urlsafe(48)
        AccessToken.objects.create(
            user=self.user,
            application=app,
            token=token_value,
            scope=scope,
            expires=timezone.now() + timedelta(hours=1),
        )
        return token_value

    def test_unauthenticated_mcp_returns_bearer_challenge_with_resource_metadata(self):
        resp = self.client.post(
            "/api/mcp/",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
        challenge = resp.headers.get("WWW-Authenticate", "")
        self.assertTrue(challenge.startswith("Bearer"))
        self.assertIn(
            'resource_metadata="http://testserver/.well-known/oauth-protected-resource/api/mcp"',
            challenge,
        )

    def test_oauth_access_token_authorizes_mcp_call(self):
        token = self._issue_token()
        resp = self.client.post(
            "/api/mcp/",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertEqual(body.get("result"), {})

    def test_invalid_oauth_token_is_rejected(self):
        resp = self.client.post(
            "/api/mcp/",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer not-a-real-token",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class TokenManagementTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="token-mgr",
            email="tm@example.com",
            password="testpw123",
        )
        self.other = User.objects.create_user(
            username="other-user",
            email="other@example.com",
            password="testpw123",
        )
        self.app = ApplicationModel.objects.create(
            name="Connected app",
            user=None,
            client_type=ApplicationModel.CLIENT_PUBLIC,
            authorization_grant_type=ApplicationModel.GRANT_AUTHORIZATION_CODE,
            redirect_uris="http://127.0.0.1/cb",
            client_secret="",
        )

    def _create_token(self, user) -> AccessToken:
        from django.utils import timezone
        from datetime import timedelta

        return AccessToken.objects.create(
            user=user,
            application=self.app,
            token=secrets.token_urlsafe(48),
            scope="read",
            expires=timezone.now() + timedelta(hours=1),
        )

    def test_list_returns_only_caller_tokens(self):
        own = self._create_token(self.user)
        self._create_token(self.other)
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.get("/api/oauth/tokens/")
        self.assertEqual(resp.status_code, 200)
        ids = [t["id"] for t in resp.json()["tokens"]]
        self.assertEqual(ids, [own.id])

    def test_revoke_deletes_own_token(self):
        own = self._create_token(self.user)
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.delete(f"/api/oauth/tokens/{own.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AccessToken.objects.filter(id=own.id).exists())

    def test_cannot_revoke_someone_elses_token(self):
        other_token = self._create_token(self.other)
        client = APIClient()
        client.force_authenticate(user=self.user)
        resp = client.delete(f"/api/oauth/tokens/{other_token.id}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(AccessToken.objects.filter(id=other_token.id).exists())


@override_settings(OAUTH2_PROVIDER_ISSUER_URL="http://testserver")
class AuthorizationCodeWithPKCEFlowTests(TestCase):
    """End-to-end: register client → authorize with PKCE → exchange code → call MCP."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="pkce-user",
            email="pkce@example.com",
            password="testpw123",
        )

    def test_full_flow(self):
        # 1) DCR
        register_body = {
            "redirect_uris": ["http://127.0.0.1:33418/callback"],
            "client_name": "Claude Desktop",
            "token_endpoint_auth_method": "none",
        }
        register_resp = self.client.post(
            "/api/oauth/register/",
            data=json.dumps(register_body),
            content_type="application/json",
        )
        self.assertEqual(register_resp.status_code, 201)
        client_id = register_resp.json()["client_id"]

        # 2) Issue an authorization code by simulating the consent grant
        #    record that AuthorizationView would have produced on POST.
        verifier, challenge = _pkce_pair()
        app = ApplicationModel.objects.get(client_id=client_id)

        from django.utils import timezone
        from datetime import timedelta

        code_value = secrets.token_urlsafe(48)
        Grant.objects.create(
            user=self.user,
            code=code_value,
            application=app,
            expires=timezone.now() + timedelta(minutes=5),
            redirect_uri="http://127.0.0.1:33418/callback",
            scope="read",
            code_challenge=challenge,
            code_challenge_method="S256",
        )

        # 3) Exchange the code for an access token using PKCE.
        token_resp = self.client.post(
            "/api/oauth/token/",
            data={
                "grant_type": "authorization_code",
                "code": code_value,
                "redirect_uri": "http://127.0.0.1:33418/callback",
                "client_id": client_id,
                "code_verifier": verifier,
            },
        )
        self.assertEqual(token_resp.status_code, 200, token_resp.content)
        token_body = token_resp.json()
        access_token = token_body["access_token"]
        self.assertIn("refresh_token", token_body)

        # 4) Call MCP with the Bearer token.
        mcp_resp = self.client.post(
            "/api/mcp/",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )
        self.assertEqual(mcp_resp.status_code, 200)

        # 5) Wrong verifier must fail when exchanging another code.
        bad_verifier = secrets.token_urlsafe(64)
        code_value2 = secrets.token_urlsafe(48)
        Grant.objects.create(
            user=self.user,
            code=code_value2,
            application=app,
            expires=timezone.now() + timedelta(minutes=5),
            redirect_uri="http://127.0.0.1:33418/callback",
            scope="read",
            code_challenge=challenge,
            code_challenge_method="S256",
        )
        bad_token_resp = self.client.post(
            "/api/oauth/token/",
            data={
                "grant_type": "authorization_code",
                "code": code_value2,
                "redirect_uri": "http://127.0.0.1:33418/callback",
                "client_id": client_id,
                "code_verifier": bad_verifier,
            },
        )
        self.assertEqual(bad_token_resp.status_code, 400)

        # 6) After revocation the same token must stop working.
        token_id = AccessToken.objects.get(token=access_token).id
        client = APIClient()
        client.force_authenticate(user=self.user)
        revoke_resp = client.delete(f"/api/oauth/tokens/{token_id}/")
        self.assertEqual(revoke_resp.status_code, status.HTTP_204_NO_CONTENT)
        mcp_resp_after = self.client.post(
            "/api/mcp/",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )
        self.assertEqual(mcp_resp_after.status_code, status.HTTP_401_UNAUTHORIZED)
        # Refresh token rows should also be gone for hygiene.
        self.assertFalse(RefreshToken.objects.filter(access_token_id=token_id).exists())
