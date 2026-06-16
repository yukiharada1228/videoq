"""Dynamic Client Registration (RFC 7591) use case."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from app.domain.oauth.dto import ClientRegistrationRequest, ClientRegistrationResponse
from app.domain.oauth.ports import OAuthClientGateway

from .exceptions import InvalidClientMetadata


_ALLOWED_AUTH_METHODS = {"none", "client_secret_basic", "client_secret_post"}
_ALLOWED_GRANT_TYPES = {"authorization_code", "refresh_token"}
_ALLOWED_RESPONSE_TYPES = {"code"}


def _coerce_string_list(
    value: Any, field: str, *, required: bool = False
) -> list[str]:
    if value is None:
        if required:
            raise InvalidClientMetadata(description=f"'{field}' is required")
        return []
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise InvalidClientMetadata(
            description=f"'{field}' must be a JSON array of strings"
        )
    return [v for v in value if v]


@dataclass(frozen=True)
class RegisterOAuthClientUseCase:
    """Validate RFC 7591 metadata and persist a new OAuth client."""

    client_gateway: OAuthClientGateway
    allowed_scopes: tuple[str, ...]

    def execute(self, raw_metadata: dict[str, Any]) -> ClientRegistrationResponse:
        if not isinstance(raw_metadata, dict):
            raise InvalidClientMetadata(
                description="Request body must be a JSON object"
            )

        redirect_uris = _coerce_string_list(
            raw_metadata.get("redirect_uris"), "redirect_uris", required=True
        )
        if not redirect_uris:
            raise InvalidClientMetadata(
                error="invalid_redirect_uri",
                description="At least one redirect_uri is required",
            )
        for uri in redirect_uris:
            parsed = urlparse(uri)
            if parsed.scheme not in ("https", "http"):
                raise InvalidClientMetadata(
                    error="invalid_redirect_uri",
                    description=(
                        f"redirect_uri '{uri}' must use https (http allowed for "
                        "localhost)"
                    ),
                )
            if parsed.scheme == "http" and parsed.hostname not in (
                "localhost",
                "127.0.0.1",
                "::1",
            ):
                raise InvalidClientMetadata(
                    error="invalid_redirect_uri",
                    description=(
                        "http redirect_uri only allowed for localhost / "
                        "127.0.0.1 / ::1"
                    ),
                )

        token_endpoint_auth_method = (
            raw_metadata.get("token_endpoint_auth_method") or "none"
        )
        if token_endpoint_auth_method not in _ALLOWED_AUTH_METHODS:
            raise InvalidClientMetadata(
                description=(
                    f"token_endpoint_auth_method '{token_endpoint_auth_method}' "
                    "is not supported"
                )
            )

        grant_types = (
            _coerce_string_list(raw_metadata.get("grant_types"), "grant_types")
            or ["authorization_code"]
        )
        for grant in grant_types:
            if grant not in _ALLOWED_GRANT_TYPES:
                raise InvalidClientMetadata(
                    description=f"grant_type '{grant}' is not supported"
                )

        response_types = (
            _coerce_string_list(raw_metadata.get("response_types"), "response_types")
            or ["code"]
        )
        for rt in response_types:
            if rt not in _ALLOWED_RESPONSE_TYPES:
                raise InvalidClientMetadata(
                    description=f"response_type '{rt}' is not supported"
                )

        scope = raw_metadata.get("scope")
        if scope is not None and not isinstance(scope, str):
            raise InvalidClientMetadata(description="'scope' must be a string")
        if scope:
            for requested in scope.split():
                if requested not in self.allowed_scopes:
                    raise InvalidClientMetadata(
                        error="invalid_client_metadata",
                        description=f"scope '{requested}' is not supported",
                    )

        client_name = raw_metadata.get("client_name")
        if client_name is not None and not isinstance(client_name, str):
            raise InvalidClientMetadata(description="'client_name' must be a string")

        software_id = raw_metadata.get("software_id")
        if software_id is not None and not isinstance(software_id, str):
            raise InvalidClientMetadata(description="'software_id' must be a string")

        software_version = raw_metadata.get("software_version")
        if software_version is not None and not isinstance(software_version, str):
            raise InvalidClientMetadata(
                description="'software_version' must be a string"
            )

        request = ClientRegistrationRequest(
            redirect_uris=redirect_uris,
            client_name=client_name,
            token_endpoint_auth_method=token_endpoint_auth_method,
            grant_types=grant_types,
            response_types=response_types,
            scope=scope,
            software_id=software_id,
            software_version=software_version,
        )
        return self.client_gateway.register(request)
