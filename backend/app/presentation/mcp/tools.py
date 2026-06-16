"""MCP tool catalog and dispatch.

Tools wrap existing use cases and return JSON-serialisable payloads that
mirror the equivalent REST endpoint shapes. Adding a new tool means
registering it in ``MCPToolRegistry._register_all`` and injecting any
required use case via the constructor.
"""

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from app.presentation.chat.serializers import ChatLogSerializer
from app.presentation.evaluation.serializers import (
    ChatLogEvaluationSerializer,
    EvaluationSummarySerializer,
)
from app.presentation.video.serializers import (
    TagListSerializer,
    VideoGroupDetailSerializer,
    VideoGroupListSerializer,
    VideoListSerializer,
    VideoSerializer,
)
from app.use_cases.shared.exceptions import ResourceNotFound
from app.use_cases.video.dto import ListVideosInput


JSON = Dict[str, Any]


class McpToolError(Exception):
    """Tool-level error surfaced to MCP clients as ``isError: true``."""

    def __init__(self, message: str, *, data: Optional[Any] = None) -> None:
        super().__init__(message)
        self.data = data


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: JSON


_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100

_PAGINATION_PROPS: JSON = {
    "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": _MAX_LIMIT,
        "description": f"Max items to return (default {_DEFAULT_LIMIT}, max {_MAX_LIMIT}).",
    },
    "offset": {
        "type": "integer",
        "minimum": 0,
        "description": "Number of items to skip.",
    },
}


def _normalize_pagination(arguments: JSON) -> tuple[int, int]:
    raw_limit = arguments.get("limit")
    limit = _DEFAULT_LIMIT if raw_limit is None else int(raw_limit)
    limit = max(1, min(limit, _MAX_LIMIT))
    offset = max(0, int(arguments.get("offset") or 0))
    return limit, offset


def _envelope(items: List[Any], *, count: int, items_key: str) -> JSON:
    return {
        "count": count,
        "next": None,
        "previous": None,
        items_key: items,
    }


def _slice(items: List[Any], limit: int, offset: int) -> List[Any]:
    return items[offset : offset + limit]


class MCPToolRegistry:
    """Registry of MCP tools backed by use cases injected at construction."""

    def __init__(
        self,
        *,
        list_videos_use_case,
        video_detail_use_case,
        list_groups_use_case,
        video_group_use_case,
        list_tags_use_case,
        chat_history_use_case,
        chat_analytics_use_case,
        chat_keywords_use_case,
        evaluation_summary_use_case,
        evaluation_logs_use_case,
    ) -> None:
        self._list_videos = list_videos_use_case
        self._video_detail = video_detail_use_case
        self._list_groups = list_groups_use_case
        self._video_group = video_group_use_case
        self._list_tags = list_tags_use_case
        self._chat_history = chat_history_use_case
        self._chat_analytics = chat_analytics_use_case
        self._chat_keywords = chat_keywords_use_case
        self._evaluation_summary = evaluation_summary_use_case
        self._evaluation_logs = evaluation_logs_use_case

        self._tools: Dict[str, Tool] = {}
        self._handlers: Dict[str, Callable[[int, JSON], JSON]] = {}
        self._register_all()

    # --- registration --------------------------------------------------

    def _register(
        self,
        *,
        name: str,
        description: str,
        input_schema: JSON,
        handler: Callable[[int, JSON], JSON],
    ) -> None:
        self._tools[name] = Tool(
            name=name, description=description, input_schema=input_schema
        )
        self._handlers[name] = handler

    def _register_all(self) -> None:
        self._register(
            name="list_videos",
            description=(
                "List your videos. Supports keyword, status, ordering, tag filters, "
                "and limit/offset pagination. Returns count/next/previous/videos."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "q": {"type": "string"},
                    "status": {
                        "type": "string",
                        "enum": [
                            "pending",
                            "processing",
                            "indexing",
                            "completed",
                            "error",
                        ],
                    },
                    "ordering": {
                        "type": "string",
                        "enum": [
                            "uploaded_at_desc",
                            "uploaded_at_asc",
                            "title_asc",
                            "title_desc",
                        ],
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "integer"},
                    },
                    **_PAGINATION_PROPS,
                },
                "additionalProperties": False,
            },
            handler=self._handle_list_videos,
        )
        self._register(
            name="get_video",
            description=(
                "Get a video's detail by ID, including transcript when available."
            ),
            input_schema={
                "type": "object",
                "properties": {"video_id": {"type": "integer"}},
                "required": ["video_id"],
                "additionalProperties": False,
            },
            handler=self._handle_get_video,
        )
        self._register(
            name="list_groups",
            description="List your video groups. Supports limit/offset pagination.",
            input_schema={
                "type": "object",
                "properties": {**_PAGINATION_PROPS},
                "additionalProperties": False,
            },
            handler=self._handle_list_groups,
        )
        self._register(
            name="get_group",
            description="Get a video group's detail and its member videos.",
            input_schema={
                "type": "object",
                "properties": {"group_id": {"type": "integer"}},
                "required": ["group_id"],
                "additionalProperties": False,
            },
            handler=self._handle_get_group,
        )
        self._register(
            name="list_tags",
            description="List your tags. Supports limit/offset pagination.",
            input_schema={
                "type": "object",
                "properties": {**_PAGINATION_PROPS},
                "additionalProperties": False,
            },
            handler=self._handle_list_tags,
        )
        self._register(
            name="get_chat_history",
            description=(
                "Get chat history for a group. Each entry includes role, content, "
                "feedback (good/bad/null), citations, and timestamps. "
                "Supports limit/offset pagination."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "group_id": {"type": "integer"},
                    **_PAGINATION_PROPS,
                },
                "required": ["group_id"],
                "additionalProperties": False,
            },
            handler=self._handle_chat_history,
        )
        self._register(
            name="get_chat_analytics",
            description=(
                "Get aggregated chat analytics for a group: total question count, "
                "date range, daily time series, and feedback breakdown (good/bad/none)."
            ),
            input_schema={
                "type": "object",
                "properties": {"group_id": {"type": "integer"}},
                "required": ["group_id"],
                "additionalProperties": False,
            },
            handler=self._handle_chat_analytics,
        )
        self._register(
            name="get_chat_analytics_keywords",
            description=(
                "Get keyword frequency for questions asked in a group's chat. "
                "Returns a list of {word, count} entries."
            ),
            input_schema={
                "type": "object",
                "properties": {"group_id": {"type": "integer"}},
                "required": ["group_id"],
                "additionalProperties": False,
            },
            handler=self._handle_chat_keywords,
        )
        self._register(
            name="get_evaluation_summary",
            description=(
                "Get averaged RAGAS evaluation scores for a group: evaluated_count, "
                "avg_faithfulness, avg_answer_relevancy, avg_context_precision."
            ),
            input_schema={
                "type": "object",
                "properties": {"group_id": {"type": "integer"}},
                "required": ["group_id"],
                "additionalProperties": False,
            },
            handler=self._handle_evaluation_summary,
        )
        self._register(
            name="list_evaluation_logs",
            description=(
                "List per-ChatLog RAGAS evaluation results for a group. Each entry "
                "has chat_log_id, status, faithfulness, answer_relevancy, "
                "context_precision, error_message, evaluated_at. "
                "Supports limit/offset pagination."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "group_id": {"type": "integer"},
                    **_PAGINATION_PROPS,
                },
                "required": ["group_id"],
                "additionalProperties": False,
            },
            handler=self._handle_evaluation_logs,
        )

    # --- public API ----------------------------------------------------

    def list_tools(self) -> List[Tool]:
        return list(self._tools.values())

    def call(self, name: str, user_id: int, arguments: JSON) -> JSON:
        handler = self._handlers.get(name)
        if handler is None:
            raise McpToolError(f"Unknown tool: {name}")
        return handler(user_id, arguments)

    # --- handlers ------------------------------------------------------

    def _handle_list_videos(self, user_id: int, arguments: JSON) -> JSON:
        limit, offset = _normalize_pagination(arguments)
        tags = arguments.get("tags") or []
        input_dto = ListVideosInput(
            keyword=(arguments.get("q") or "").strip(),
            status_filter=(arguments.get("status") or "").strip(),
            sort_key=(arguments.get("ordering") or "").strip(),
            tag_ids=[int(t) for t in tags] or None,
        )
        page = self._list_videos.execute_page(
            user_id=user_id,
            input=input_dto,
            limit=limit,
            offset=offset,
        )
        data = list(VideoListSerializer(page.results, many=True).data)
        return _envelope(data, count=page.count, items_key="videos")

    def _handle_get_video(self, user_id: int, arguments: JSON) -> JSON:
        video_id = int(arguments["video_id"])
        video = self._video_detail.execute(video_id, user_id)
        if video is None:
            raise McpToolError("Video not found", data={"status": 404})
        return {"video": VideoSerializer(video).data}

    def _handle_list_groups(self, user_id: int, arguments: JSON) -> JSON:
        limit, offset = _normalize_pagination(arguments)
        page = self._list_groups.execute_page(
            user_id=user_id,
            limit=limit,
            offset=offset,
        )
        data = list(VideoGroupListSerializer(page.results, many=True).data)
        return _envelope(data, count=page.count, items_key="groups")

    def _handle_get_group(self, user_id: int, arguments: JSON) -> JSON:
        group_id = int(arguments["group_id"])
        try:
            group = self._video_group.execute(
                group_id, user_id, include_videos=True
            )
        except ResourceNotFound:
            raise McpToolError("Group not found", data={"status": 404})
        return {"group": VideoGroupDetailSerializer(group).data}

    def _handle_list_tags(self, user_id: int, arguments: JSON) -> JSON:
        limit, offset = _normalize_pagination(arguments)
        tags = self._list_tags.execute(user_id=user_id)
        data = list(TagListSerializer(tags, many=True).data)
        return _envelope(
            _slice(data, limit, offset), count=len(data), items_key="tags"
        )

    def _handle_chat_history(self, user_id: int, arguments: JSON) -> JSON:
        group_id = int(arguments["group_id"])
        limit, offset = _normalize_pagination(arguments)
        try:
            logs = self._chat_history.execute(
                group_id=group_id, user_id=user_id, ascending=False
            )
        except ResourceNotFound:
            raise McpToolError("Group not found", data={"status": 404})
        data = list(ChatLogSerializer(logs, many=True).data)
        return _envelope(
            _slice(data, limit, offset), count=len(data), items_key="history"
        )

    def _handle_chat_analytics(self, user_id: int, arguments: JSON) -> JSON:
        group_id = int(arguments["group_id"])
        try:
            dto = self._chat_analytics.execute(group_id=group_id, user_id=user_id)
        except ResourceNotFound:
            raise McpToolError("Group not found", data={"status": 404})
        return {
            "analytics": {
                "summary": {
                    "total_questions": dto.total_questions,
                    "date_range": {
                        "first": dto.date_range.first,
                        "last": dto.date_range.last,
                    },
                },
                "time_series": [
                    {"date": item.date, "count": item.count}
                    for item in dto.time_series
                ],
                "feedback": {
                    "good": dto.feedback.good,
                    "bad": dto.feedback.bad,
                    "none": dto.feedback.none,
                },
            }
        }

    def _handle_chat_keywords(self, user_id: int, arguments: JSON) -> JSON:
        group_id = int(arguments["group_id"])
        try:
            keywords = self._chat_keywords.execute(
                group_id=group_id, user_id=user_id
            )
        except ResourceNotFound:
            raise McpToolError("Group not found", data={"status": 404})
        return {
            "keywords": [
                {"word": item.word, "count": item.count} for item in keywords
            ]
        }

    def _handle_evaluation_summary(self, user_id: int, arguments: JSON) -> JSON:
        group_id = int(arguments["group_id"])
        try:
            dto = self._evaluation_summary.execute(
                group_id=group_id, user_id=user_id
            )
        except ResourceNotFound:
            raise McpToolError("Group not found", data={"status": 404})
        return {
            "summary": EvaluationSummarySerializer(
                {
                    "group_id": dto.group_id,
                    "evaluated_count": dto.evaluated_count,
                    "avg_faithfulness": dto.avg_faithfulness,
                    "avg_answer_relevancy": dto.avg_answer_relevancy,
                    "avg_context_precision": dto.avg_context_precision,
                }
            ).data
        }

    def _handle_evaluation_logs(self, user_id: int, arguments: JSON) -> JSON:
        group_id = int(arguments["group_id"])
        limit, offset = _normalize_pagination(arguments)
        try:
            entities = self._evaluation_logs.execute(
                group_id=group_id, user_id=user_id
            )
        except ResourceNotFound:
            raise McpToolError("Group not found", data={"status": 404})
        rows = [
            {
                "chat_log_id": e.chat_log_id,
                "status": e.status,
                "faithfulness": e.faithfulness,
                "answer_relevancy": e.answer_relevancy,
                "context_precision": e.context_precision,
                "error_message": e.error_message,
                "evaluated_at": e.evaluated_at,
            }
            for e in entities
        ]
        data = list(ChatLogEvaluationSerializer(rows, many=True).data)
        return _envelope(
            _slice(data, limit, offset), count=len(data), items_key="logs"
        )
