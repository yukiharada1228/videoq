#!/usr/bin/env python3
"""Minimal stdio MCP server for VideoQ's existing API-key protected REST API."""

import json
import os
import sys
import traceback
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional
from urllib import error, parse, request


JSON = Dict[str, Any]


DEBUG = os.environ.get("VIDEOQ_MCP_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}


def debug_log(message: str) -> None:
    if DEBUG:
        print(f"[videoq-mcp] {message}", file=sys.stderr, flush=True)


class McpError(Exception):
    """Application-level error returned to MCP clients."""

    def __init__(self, message: str, *, data: Optional[Any] = None):
        super().__init__(message)
        self.data = data


@dataclass
class ToolDefinition:
    name: str
    description: str
    input_schema: JSON
    handler: Callable[[JSON], JSON]


class VideoQApiClient:
    """Thin API client over VideoQ's HTTP API using X-API-Key."""

    def __init__(self, *, base_url: str, api_key: str, timeout_seconds: float) -> None:
        normalized = base_url.rstrip("/")
        if not normalized.endswith("/api"):
            normalized = f"{normalized}/api"
        self.base_url = normalized
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def get(self, path: str, *, query: Optional[Dict[str, Any]] = None) -> Any:
        return self._request("GET", path, query=query)

    def post(self, path: str, *, payload: Optional[Dict[str, Any]] = None) -> Any:
        return self._request("POST", path, payload=payload)

    def _request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[Dict[str, Any]] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        if query:
            filtered = {
                key: value
                for key, value in query.items()
                if value is not None and value != "" and value != []
            }
            if filtered:
                url = f"{url}?{parse.urlencode(filtered, doseq=True)}"

        body = None
        headers = {
            "Accept": "application/json",
            "X-API-Key": self.api_key,
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload).encode("utf-8")

        req = request.Request(url, data=body, method=method, headers=headers)
        try:
            with request.urlopen(req, timeout=self.timeout_seconds) as response:
                return self._parse_response(response.read())
        except error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            detail = self._extract_error_message(body_text) or exc.reason
            raise McpError(
                f"VideoQ API request failed with {exc.code}: {detail}",
                data={"status": exc.code, "body": self._parse_text_as_json(body_text)},
            ) from exc
        except error.URLError as exc:
            raise McpError(f"Could not connect to VideoQ API: {exc.reason}") from exc

    def _parse_response(self, raw_body: bytes) -> Any:
        if not raw_body:
            return {}
        text = raw_body.decode("utf-8")
        return self._parse_text_as_json(text)

    @staticmethod
    def _parse_text_as_json(text: str) -> Any:
        if not text.strip():
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"raw": text}

    @staticmethod
    def _extract_error_message(body_text: str) -> Optional[str]:
        parsed = VideoQApiClient._parse_text_as_json(body_text)
        if isinstance(parsed, dict):
            error_obj = parsed.get("error")
            if isinstance(error_obj, dict) and isinstance(error_obj.get("message"), str):
                return error_obj["message"]
            detail = parsed.get("detail")
            if isinstance(detail, str):
                return detail
        return None


class VideoQMcpServer:
    def __init__(self) -> None:
        api_key = os.environ.get("VIDEOQ_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("VIDEOQ_API_KEY is required")

        timeout = float(os.environ.get("VIDEOQ_TIMEOUT_SECONDS", "30"))
        base_url = os.environ.get("VIDEOQ_BASE_URL", "http://localhost/api")
        self.api = VideoQApiClient(
            base_url=base_url,
            api_key=api_key,
            timeout_seconds=timeout,
        )
        self.server_name = "videoq-api"
        self.server_version = "0.1.0"
        self.tools = self._build_tools()
        self.transport_mode = "content-length"

    def _build_tools(self) -> Dict[str, ToolDefinition]:
        return {
            tool.name: tool
            for tool in [
                ToolDefinition(
                    name="list_videos",
                    description="List your videos. Supports keyword, status, ordering, and tag filters.",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "q": {"type": "string"},
                            "status": {
                                "type": "string",
                                "enum": ["pending", "processing", "indexing", "completed", "error"],
                            },
                            "ordering": {
                                "type": "string",
                                "enum": ["uploaded_at_desc", "uploaded_at_asc", "title_asc", "title_desc"],
                            },
                            "tags": {
                                "type": "array",
                                "items": {"type": "integer"},
                            },
                        },
                        "additionalProperties": False,
                    },
                    handler=self._list_videos,
                ),
                ToolDefinition(
                    name="get_video",
                    description="Get a video's detail by ID, including transcript when available.",
                    input_schema={
                        "type": "object",
                        "properties": {"video_id": {"type": "integer"}},
                        "required": ["video_id"],
                        "additionalProperties": False,
                    },
                    handler=self._get_video,
                ),
                ToolDefinition(
                    name="list_groups",
                    description="List your video groups.",
                    input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                    handler=self._list_groups,
                ),
                ToolDefinition(
                    name="get_group",
                    description="Get a video group's detail and its member videos.",
                    input_schema={
                        "type": "object",
                        "properties": {"group_id": {"type": "integer"}},
                        "required": ["group_id"],
                        "additionalProperties": False,
                    },
                    handler=self._get_group,
                ),
                ToolDefinition(
                    name="list_tags",
                    description="List your tags.",
                    input_schema={"type": "object", "properties": {}, "additionalProperties": False},
                    handler=self._list_tags,
                ),
                ToolDefinition(
                    name="search_related_scenes",
                    description="Search related scenes in a group without generating an LLM answer.",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "group_id": {"type": "integer"},
                            "query_text": {"type": "string"},
                        },
                        "required": ["group_id", "query_text"],
                        "additionalProperties": False,
                    },
                    handler=self._search_related_scenes,
                ),
                ToolDefinition(
                    name="ask_videoq",
                    description="Ask VideoQ a question. Optionally scope retrieval to a group_id.",
                    input_schema={
                        "type": "object",
                        "properties": {
                            "question": {"type": "string"},
                            "group_id": {"type": "integer"},
                        },
                        "required": ["question"],
                        "additionalProperties": False,
                    },
                    handler=self._ask_videoq,
                ),
                ToolDefinition(
                    name="get_chat_history",
                    description="Get chat history for a group.",
                    input_schema={
                        "type": "object",
                        "properties": {"group_id": {"type": "integer"}},
                        "required": ["group_id"],
                        "additionalProperties": False,
                    },
                    handler=self._get_chat_history,
                ),
            ]
        }

    def _list_videos(self, arguments: JSON) -> JSON:
        query = {
            "q": arguments.get("q"),
            "status": arguments.get("status"),
            "ordering": arguments.get("ordering"),
        }
        tags = arguments.get("tags")
        if tags:
            query["tags"] = ",".join(str(tag_id) for tag_id in tags)
        videos = self.api.get("/videos/", query=query)
        return {"count": len(videos), "videos": videos}

    def _get_video(self, arguments: JSON) -> JSON:
        video_id = int(arguments["video_id"])
        video = self.api.get(f"/videos/{video_id}/")
        return {"video": video}

    def _list_groups(self, arguments: JSON) -> JSON:
        del arguments
        groups = self.api.get("/videos/groups/")
        return {"count": len(groups), "groups": groups}

    def _get_group(self, arguments: JSON) -> JSON:
        group_id = int(arguments["group_id"])
        group = self.api.get(f"/videos/groups/{group_id}/")
        return {"group": group}

    def _list_tags(self, arguments: JSON) -> JSON:
        del arguments
        tags = self.api.get("/videos/tags/")
        return {"count": len(tags), "tags": tags}

    def _search_related_scenes(self, arguments: JSON) -> JSON:
        return self.api.post(
            "/chat/search/",
            payload={
                "group_id": int(arguments["group_id"]),
                "query_text": arguments["query_text"],
            },
        )

    def _ask_videoq(self, arguments: JSON) -> JSON:
        payload = {
            "messages": [{"role": "user", "content": arguments["question"]}],
        }
        if "group_id" in arguments and arguments["group_id"] is not None:
            payload["group_id"] = int(arguments["group_id"])
        return self.api.post("/chat/", payload=payload)

    def _get_chat_history(self, arguments: JSON) -> JSON:
        group_id = int(arguments["group_id"])
        history = self.api.get("/chat/history/", query={"group_id": group_id})
        return {"count": len(history), "history": history}

    def serve_forever(self) -> None:
        stdin = sys.stdin.buffer
        debug_log("server loop started")
        while True:
            message = self._read_message(stdin)
            if message is None:
                debug_log("stdin closed")
                return
            self._handle_message(message)

    def _handle_message(self, message: JSON) -> None:
        method = message.get("method")
        if method is None:
            if "id" in message:
                self._write_error(message["id"], -32600, "Invalid Request")
            return

        if "id" not in message:
            if method == "notifications/initialized":
                return
            return

        request_id = message["id"]
        params = message.get("params", {})

        try:
            debug_log(f"received method={method!r} id={request_id!r}")
            if method == "initialize":
                requested_version = params.get("protocolVersion", "2024-11-05")
                self._write_result(
                    request_id,
                    {
                        "protocolVersion": requested_version,
                        "capabilities": {"tools": {"listChanged": False}},
                        "serverInfo": {
                            "name": self.server_name,
                            "version": self.server_version,
                        },
                    },
                )
                return

            if method == "ping":
                self._write_result(request_id, {})
                return

            if method == "tools/list":
                self._write_result(
                    request_id,
                    {
                        "tools": [
                            {
                                "name": tool.name,
                                "description": tool.description,
                                "inputSchema": tool.input_schema,
                            }
                            for tool in self.tools.values()
                        ]
                    },
                )
                return

            if method == "tools/call":
                tool_name = params.get("name")
                arguments = params.get("arguments", {})
                if tool_name not in self.tools:
                    raise McpError(f"Unknown tool: {tool_name}")
                result = self.tools[tool_name].handler(arguments)
                self._write_result(
                    request_id,
                    {
                        "content": [
                            {
                                "type": "text",
                                "text": json.dumps(result, ensure_ascii=False, indent=2),
                            }
                        ],
                        "structuredContent": result,
                        "isError": False,
                    },
                )
                return

            self._write_error(request_id, -32601, f"Method not found: {method}")
        except McpError as exc:
            debug_log(f"mcp error for method={method!r}: {exc}")
            result = {
                "content": [{"type": "text", "text": str(exc)}],
                "isError": True,
            }
            if exc.data is not None:
                result["structuredContent"] = exc.data
            self._write_result(request_id, result)
        except Exception as exc:  # pragma: no cover
            traceback.print_exc(file=sys.stderr)
            self._write_error(request_id, -32000, f"Internal error: {exc}")

    def _read_message(self, stream) -> Optional[JSON]:
        headers = {}
        first_line = None
        while True:
            line = stream.readline()
            if not line:
                return None
            if first_line is None:
                first_line = line
                stripped = line.lstrip()
                if stripped.startswith(b"{"):
                    self.transport_mode = "json-line"
                    debug_log(f"read json line bytes={len(line.strip())}")
                    return json.loads(line.decode("utf-8"))
            if line in (b"\r\n", b"\n"):
                break
            decoded = line.decode("utf-8").strip()
            if ":" not in decoded:
                continue
            name, value = decoded.split(":", 1)
            headers[name.lower()] = value.strip()

        content_length = headers.get("content-length")
        if not content_length:
            raise RuntimeError("Missing Content-Length header")

        body = stream.read(int(content_length))
        if not body:
            return None
        self.transport_mode = "content-length"
        debug_log(f"read message bytes={len(body)}")
        return json.loads(body.decode("utf-8"))

    def _write_message(self, payload: JSON) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        debug_log(
            f"sending message mode={self.transport_mode} bytes={len(encoded)} keys={list(payload.keys())}"
        )
        if self.transport_mode == "json-line":
            sys.stdout.buffer.write(encoded + b"\n")
            sys.stdout.buffer.flush()
            return
        sys.stdout.buffer.write(f"Content-Length: {len(encoded)}\r\n\r\n".encode("ascii"))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()

    def _write_result(self, request_id: Any, result: JSON) -> None:
        self._write_message({"jsonrpc": "2.0", "id": request_id, "result": result})

    def _write_error(self, request_id: Any, code: int, message: str) -> None:
        self._write_message(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": code, "message": message},
            }
        )


def main() -> int:
    try:
        server = VideoQMcpServer()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
