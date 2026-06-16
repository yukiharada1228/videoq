"""Integration tests for the remote MCP endpoint."""

import json

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()
UserApiKey = apps.get_model("app", "UserApiKey")

MCP_URL = "/api/mcp/"


class MCPEndpointTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="mcp_user",
            email="mcp@example.com",
            password="pass12345",
        )
        _api_key, self.raw_key = UserApiKey.create_for_user(
            user=self.user,
            name="mcp-test",
        )
        self.client = APIClient()
        self.auth_header = f"Bearer {self.raw_key}"

    # --- helpers -------------------------------------------------------

    def _post(self, body, *, auth=True):
        kwargs = {}
        if auth:
            kwargs["HTTP_AUTHORIZATION"] = self.auth_header
        return self.client.post(
            MCP_URL,
            data=json.dumps(body),
            content_type="application/json",
            **kwargs,
        )

    @staticmethod
    def _jsonrpc(method, params=None, request_id=1):
        body = {"jsonrpc": "2.0", "method": method, "id": request_id}
        if params is not None:
            body["params"] = params
        return body

    # --- auth ----------------------------------------------------------

    def test_unauthenticated_request_is_rejected(self):
        response = self._post(self._jsonrpc("initialize"), auth=False)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_api_key_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer vq_" + "x" * 32)
        response = self.client.post(
            MCP_URL,
            data=json.dumps(self._jsonrpc("initialize")),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_x_api_key_header_is_accepted(self):
        response = self.client.post(
            MCP_URL,
            data=json.dumps(self._jsonrpc("initialize")),
            content_type="application/json",
            HTTP_X_API_KEY=self.raw_key,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # --- initialize / ping / tools/list --------------------------------

    def test_initialize_returns_server_info(self):
        response = self._post(
            self._jsonrpc("initialize", {"protocolVersion": "2025-03-26"})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["jsonrpc"], "2.0")
        self.assertEqual(data["id"], 1)
        result = data["result"]
        self.assertEqual(result["protocolVersion"], "2025-03-26")
        self.assertEqual(result["serverInfo"]["name"], "videoq-api")
        self.assertIn("tools", result["capabilities"])

    def test_initialize_echoes_supported_protocol_version_when_omitted(self):
        response = self._post(self._jsonrpc("initialize"))
        data = response.json()
        self.assertTrue(data["result"]["protocolVersion"])

    def test_ping_returns_empty_result(self):
        response = self._post(self._jsonrpc("ping"))
        self.assertEqual(response.json()["result"], {})

    def test_tools_list_returns_all_tools(self):
        response = self._post(self._jsonrpc("tools/list"))
        names = [t["name"] for t in response.json()["result"]["tools"]]
        self.assertEqual(
            sorted(names),
            sorted(
                [
                    "list_videos",
                    "get_video",
                    "list_groups",
                    "get_group",
                    "list_tags",
                    "get_chat_history",
                    "get_chat_analytics",
                    "get_chat_analytics_keywords",
                    "get_evaluation_summary",
                    "list_evaluation_logs",
                ]
            ),
        )

    # --- tools/call ----------------------------------------------------

    def test_tools_call_list_videos_returns_empty_for_new_user(self):
        response = self._post(
            self._jsonrpc("tools/call", {"name": "list_videos", "arguments": {}})
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result = response.json()["result"]
        self.assertFalse(result["isError"])
        structured = result["structuredContent"]
        self.assertEqual(structured["count"], 0)
        self.assertEqual(structured["videos"], [])

    def test_tools_call_list_tags_returns_pagination_envelope(self):
        response = self._post(
            self._jsonrpc("tools/call", {"name": "list_tags", "arguments": {}})
        )
        structured = response.json()["result"]["structuredContent"]
        self.assertIn("count", structured)
        self.assertIn("tags", structured)
        self.assertEqual(structured["tags"], [])

    def test_tools_call_get_video_missing_returns_tool_error(self):
        response = self._post(
            self._jsonrpc(
                "tools/call",
                {"name": "get_video", "arguments": {"video_id": 999999}},
            )
        )
        result = response.json()["result"]
        self.assertTrue(result["isError"])
        self.assertEqual(result["content"][0]["text"], "Video not found")

    def test_tools_call_unknown_tool_returns_tool_error(self):
        response = self._post(
            self._jsonrpc(
                "tools/call", {"name": "nope", "arguments": {}}
            )
        )
        result = response.json()["result"]
        self.assertTrue(result["isError"])
        self.assertIn("Unknown tool", result["content"][0]["text"])

    def test_tools_call_returns_text_content_with_serialized_json(self):
        response = self._post(
            self._jsonrpc("tools/call", {"name": "list_videos", "arguments": {}})
        )
        result = response.json()["result"]
        text = result["content"][0]["text"]
        parsed = json.loads(text)
        self.assertEqual(parsed, result["structuredContent"])

    def test_tools_call_with_invalid_params_returns_invalid_params_error(self):
        response = self._post(
            self._jsonrpc("tools/call", {"name": 123, "arguments": {}})
        )
        body = response.json()
        self.assertEqual(body["error"]["code"], -32602)

    # --- JSON-RPC plumbing --------------------------------------------

    def test_unknown_method_returns_method_not_found(self):
        response = self._post(self._jsonrpc("does_not_exist"))
        body = response.json()
        self.assertEqual(body["error"]["code"], -32601)

    def test_notification_returns_202_with_no_body(self):
        body = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        response = self._post(body)
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)

    def test_batch_request_returns_array(self):
        response = self._post(
            [
                self._jsonrpc("ping", request_id=1),
                self._jsonrpc("tools/list", request_id=2),
            ]
        )
        body = response.json()
        self.assertIsInstance(body, list)
        self.assertEqual(len(body), 2)
        self.assertEqual({entry["id"] for entry in body}, {1, 2})

    def test_batch_of_notifications_returns_202(self):
        response = self._post(
            [
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
                {"jsonrpc": "2.0", "method": "notifications/initialized"},
            ]
        )
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)

    def test_empty_batch_is_invalid(self):
        response = self._post([])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_returns_405(self):
        response = self.client.get(MCP_URL, HTTP_AUTHORIZATION=self.auth_header)
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
