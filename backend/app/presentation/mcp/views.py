"""MCP Streamable HTTP endpoint.

Speaks JSON-RPC 2.0 over a single POST endpoint, dispatching MCP methods
(initialize, tools/list, tools/call, ping) to the local tool registry.
Authentication piggybacks on the existing API-key infrastructure, so
clients can authenticate with either ``Authorization: Bearer vq_...`` or
``X-API-Key: vq_...``.
"""

import json
import logging
from typing import Any, Optional

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.presentation.common.authentication import (
    APIKeyAuthentication,
    BearerAPIKeyAuthentication,
    MCPOAuth2Authentication,
)
from app.presentation.common.mixins import DependencyResolverMixin
from app.presentation.common.permissions import ApiKeyScopePermission
from app.presentation.mcp.tools import MCPToolRegistry, McpToolError

logger = logging.getLogger(__name__)


PROTOCOL_VERSION = "2025-03-26"
SERVER_NAME = "videoq-api"
SERVER_VERSION = "0.2.0"

# JSON-RPC 2.0 error codes
_INVALID_REQUEST = -32600
_METHOD_NOT_FOUND = -32601
_INVALID_PARAMS = -32602
_INTERNAL_ERROR = -32603


class MCPEndpointView(DependencyResolverMixin, APIView):
    """Stateless MCP Streamable HTTP endpoint."""

    # MCPOAuth2Authentication is listed FIRST so that anonymous 401 responses
    # include a Bearer challenge with the ``resource_metadata`` parameter, which
    # is what Claude Desktop / claude.ai's built-in connector uses to discover
    # the OAuth authorization server. Existing ``vq_*`` API keys continue to
    # work via BearerAPIKeyAuthentication / APIKeyAuthentication.
    authentication_classes = [
        MCPOAuth2Authentication,
        BearerAPIKeyAuthentication,
        APIKeyAuthentication,
    ]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]

    # Injected via as_view(...) wiring in urls.py
    list_videos_use_case = None
    video_detail_use_case = None
    list_groups_use_case = None
    video_group_use_case = None
    list_tags_use_case = None
    chat_history_use_case = None
    chat_analytics_use_case = None
    chat_keywords_use_case = None
    evaluation_summary_use_case = None
    evaluation_logs_use_case = None

    def post(self, request, *args, **kwargs):
        payload = request.data
        registry = self._build_registry()
        user_id = request.user.id

        if isinstance(payload, list):
            if not payload:
                return Response(
                    self._make_error(None, _INVALID_REQUEST, "Empty batch"),
                    status=status.HTTP_400_BAD_REQUEST,
                )
            responses = [
                resp
                for resp in (
                    self._dispatch(item, registry, user_id) for item in payload
                )
                if resp is not None
            ]
            if not responses:
                return Response(status=status.HTTP_202_ACCEPTED)
            return Response(responses)

        if not isinstance(payload, dict):
            return Response(
                self._make_error(
                    None, _INVALID_REQUEST, "Request must be a JSON object or array"
                ),
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = self._dispatch(payload, registry, user_id)
        if result is None:
            return Response(status=status.HTTP_202_ACCEPTED)
        return Response(result)

    def get(self, request, *args, **kwargs):
        # Server-initiated SSE streams are not implemented (spec MAY: 405).
        return Response(
            {"error": "GET is not supported on this endpoint"},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def delete(self, request, *args, **kwargs):
        # Stateless: no session to terminate.
        return Response(status=status.HTTP_204_NO_CONTENT)

    # --- internals -----------------------------------------------------

    def _build_registry(self) -> MCPToolRegistry:
        return MCPToolRegistry(
            list_videos_use_case=self.resolve_dependency(self.list_videos_use_case),
            video_detail_use_case=self.resolve_dependency(
                self.video_detail_use_case
            ),
            list_groups_use_case=self.resolve_dependency(self.list_groups_use_case),
            video_group_use_case=self.resolve_dependency(self.video_group_use_case),
            list_tags_use_case=self.resolve_dependency(self.list_tags_use_case),
            chat_history_use_case=self.resolve_dependency(
                self.chat_history_use_case
            ),
            chat_analytics_use_case=self.resolve_dependency(
                self.chat_analytics_use_case
            ),
            chat_keywords_use_case=self.resolve_dependency(
                self.chat_keywords_use_case
            ),
            evaluation_summary_use_case=self.resolve_dependency(
                self.evaluation_summary_use_case
            ),
            evaluation_logs_use_case=self.resolve_dependency(
                self.evaluation_logs_use_case
            ),
        )

    def _dispatch(
        self,
        message: Any,
        registry: MCPToolRegistry,
        user_id: int,
    ) -> Optional[dict]:
        if not isinstance(message, dict):
            return self._make_error(
                None, _INVALID_REQUEST, "Request must be a JSON object"
            )

        request_id = message.get("id")
        is_notification = "id" not in message
        method = message.get("method")
        if not isinstance(method, str):
            if is_notification:
                return None
            return self._make_error(
                request_id, _INVALID_REQUEST, "Missing or invalid 'method'"
            )

        params = message.get("params") or {}

        try:
            if method == "initialize":
                if is_notification:
                    return None
                requested_version = (
                    params.get("protocolVersion")
                    if isinstance(params, dict)
                    else None
                )
                return self._make_result(
                    request_id,
                    {
                        "protocolVersion": requested_version or PROTOCOL_VERSION,
                        "capabilities": {"tools": {"listChanged": False}},
                        "serverInfo": {
                            "name": SERVER_NAME,
                            "version": SERVER_VERSION,
                        },
                    },
                )

            if method in ("notifications/initialized", "initialized"):
                return None

            if method == "ping":
                if is_notification:
                    return None
                return self._make_result(request_id, {})

            if method == "tools/list":
                if is_notification:
                    return None
                tools_payload = [
                    {
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": t.input_schema,
                    }
                    for t in registry.list_tools()
                ]
                return self._make_result(request_id, {"tools": tools_payload})

            if method == "tools/call":
                if not isinstance(params, dict):
                    return self._make_error(
                        request_id, _INVALID_PARAMS, "params must be an object"
                    )
                tool_name = params.get("name")
                if not isinstance(tool_name, str):
                    return self._make_error(
                        request_id, _INVALID_PARAMS, "'name' must be a string"
                    )
                arguments = params.get("arguments") or {}
                if not isinstance(arguments, dict):
                    return self._make_error(
                        request_id, _INVALID_PARAMS, "'arguments' must be an object"
                    )
                try:
                    structured = registry.call(tool_name, user_id, arguments)
                except McpToolError as exc:
                    tool_error_result: dict = {
                        "content": [{"type": "text", "text": str(exc)}],
                        "isError": True,
                    }
                    if exc.data is not None:
                        tool_error_result["structuredContent"] = exc.data
                    return self._make_result(request_id, tool_error_result)

                return self._make_result(
                    request_id,
                    {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(
                                    structured, ensure_ascii=False, indent=2
                                ),
                            }
                        ],
                        "structuredContent": structured,
                        "isError": False,
                    },
                )

            if is_notification:
                return None
            return self._make_error(
                request_id, _METHOD_NOT_FOUND, f"Method not found: {method}"
            )

        except Exception:
            logger.exception("Unhandled error dispatching MCP method %s", method)
            if is_notification:
                return None
            return self._make_error(
                request_id, _INTERNAL_ERROR, "Internal error processing request"
            )

    @staticmethod
    def _make_result(request_id: Any, result: dict) -> dict:
        return {"jsonrpc": "2.0", "id": request_id, "result": result}

    @staticmethod
    def _make_error(
        request_id: Any, code: int, message: str, data: Any = None
    ) -> dict:
        error: dict = {"code": code, "message": message}
        if data is not None:
            error["data"] = data
        return {"jsonrpc": "2.0", "id": request_id, "error": error}
