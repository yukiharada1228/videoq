"""Allowlist / blocklist tests for ``AgentToolDispatcher`` (spec §9.4).

The dispatcher is the single security boundary between the LLM's tool-call
requests and the application's use cases. These tests pin the publishable tool
surface to exactly three tools and assert that the admin/analytics MCP tools are
never reachable from agentic chat, and that dispatching a disallowed tool name
fails fast with an :class:`AgentToolError`.
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.infrastructure.external.agentic.agent_config import (
    AgentBudget,
    AgentToolError,
)
from app.infrastructure.external.agentic.agent_tools import AgentToolDispatcher
from app.infrastructure.external.agentic.citation_registry import CitationRegistry
from app.infrastructure.external.agentic.context_collector import ContextLedger
from app.infrastructure.external.agentic.dtos import AgentToolContext
from app.infrastructure.external.agentic.transcript_summarizer import VideoSummary


# Admin / analytics MCP tools that must never be published to the chat agent.
_BANNED_TOOLS = (
    "get_evaluation_summary",
    "list_evaluation_logs",
    "get_chat_analytics",
    "get_chat_analytics_keywords",
    "get_chat_history",
)


def _make_dispatcher() -> AgentToolDispatcher:
    """Build a dispatcher whose use cases are never reached.

    The disallowed-tool guard runs before any use case is touched, so ``None``
    placeholders are sufficient for the blocklist tests.
    """
    return AgentToolDispatcher(
        search_scenes_use_case=None,
        get_video_use_case=None,
        list_videos_use_case=None,
        list_groups_use_case=None,
        list_tags_use_case=None,
        budget=AgentBudget(),
    )


class AgentDispatcherAllowlistTests(unittest.TestCase):
    """Pins the publishable tool surface (§9.4)."""

    def test_allowed_tools_is_exactly_the_three_chat_tools(self):
        self.assertEqual(
            AgentToolDispatcher.ALLOWED_TOOLS,
            {"search_scenes", "get_video", "list_catalog"},
        )

    def test_admin_tools_are_not_allowed(self):
        for banned in _BANNED_TOOLS:
            self.assertNotIn(banned, AgentToolDispatcher.ALLOWED_TOOLS)


class AgentDispatcherBlocklistTests(unittest.TestCase):
    """Asserts disallowed tool names fail fast at ``dispatch``."""

    def test_dispatch_of_banned_tool_raises_agent_tool_error(self):
        dispatcher = _make_dispatcher()
        ctx = AgentToolContext(user_id=1, video_ids=(1,), locale=None)
        registry = CitationRegistry()
        ledger = ContextLedger()

        for banned in _BANNED_TOOLS:
            with self.assertRaises(AgentToolError):
                dispatcher.dispatch(
                    name=banned,
                    args={},
                    ctx=ctx,
                    registry=registry,
                    ledger=ledger,
                )

    def test_dispatch_of_unknown_tool_raises_agent_tool_error(self):
        dispatcher = _make_dispatcher()
        ctx = AgentToolContext(user_id=1, video_ids=(1,), locale=None)

        with self.assertRaises(AgentToolError):
            dispatcher.dispatch(
                name="totally_made_up_tool",
                args={},
                ctx=ctx,
                registry=CitationRegistry(),
                ledger=ContextLedger(),
            )


class AgentDispatcherSummaryTests(unittest.TestCase):
    """Pins the multi-video summary support used by the agent gateway."""

    @patch(
        "app.infrastructure.external.agentic.agent_tools.map_reduce_summarize"
    )
    def test_get_video_uses_the_request_scoped_llm_for_summary(self, mock_summarize):
        transcript = "1\n00:00:00,000 --> 00:00:05,000\nA long lesson section."
        get_video = MagicMock()
        get_video.execute.return_value = SimpleNamespace(
            id=1,
            title="Lesson 1",
            transcript=transcript,
        )
        request_llm = MagicMock()
        mock_summarize.return_value = VideoSummary(
            video_id=1,
            title="Lesson 1",
            overall_summary="Lesson summary.",
        )
        dispatcher = AgentToolDispatcher(
            search_scenes_use_case=None,
            get_video_use_case=get_video,
            list_videos_use_case=None,
            list_groups_use_case=None,
            list_tags_use_case=None,
            budget=AgentBudget(transcript_inline_token_limit=1),
        )

        dispatcher.dispatch(
            name="get_video",
            args={"video_id": 1},
            ctx=AgentToolContext(user_id=7, video_ids=(1,), locale="ja"),
            registry=CitationRegistry(),
            ledger=ContextLedger(),
            llm=request_llm,
        )

        self.assertIs(mock_summarize.call_args.args[1], request_llm)

    def test_video_catalog_finds_group_videos_after_the_first_user_page(self):
        videos = [
            SimpleNamespace(id=i, title=f"Lesson {i}", status="completed")
            for i in range(1, 61)
        ]
        list_videos = MagicMock()

        def execute_page(_user_id, _input, *, limit, offset):
            return SimpleNamespace(
                results=videos[offset : offset + limit],
                count=len(videos),
            )

        list_videos.execute_page.side_effect = execute_page
        dispatcher = AgentToolDispatcher(
            search_scenes_use_case=None,
            get_video_use_case=None,
            list_videos_use_case=list_videos,
            list_groups_use_case=None,
            list_tags_use_case=None,
            budget=AgentBudget(),
        )

        result = dispatcher.dispatch(
            name="list_catalog",
            args={"kind": "videos", "limit": 50},
            ctx=AgentToolContext(user_id=7, video_ids=(55,), locale="ja"),
            registry=CitationRegistry(),
            ledger=ContextLedger(),
        )

        self.assertIn('"id": 55', result.content)
        self.assertEqual(list_videos.execute_page.call_count, 2)

    def test_get_video_rejects_calls_beyond_the_turn_limit(self):
        get_video = MagicMock()
        get_video.execute.side_effect = lambda video_id, _user_id: SimpleNamespace(
            id=video_id,
            title=f"Lesson {video_id}",
            transcript="Short transcript.",
        )
        dispatcher = AgentToolDispatcher(
            search_scenes_use_case=None,
            get_video_use_case=get_video,
            list_videos_use_case=None,
            list_groups_use_case=None,
            list_tags_use_case=None,
            budget=AgentBudget(max_get_video_calls=2),
        )
        ctx = AgentToolContext(user_id=7, video_ids=(1, 2, 3), locale="ja")
        registry = CitationRegistry()
        ledger = ContextLedger()

        dispatcher.dispatch("get_video", {"video_id": 1}, ctx, registry, ledger)
        dispatcher.dispatch("get_video", {"video_id": 2}, ctx, registry, ledger)
        with self.assertRaisesRegex(AgentToolError, "call limit reached"):
            dispatcher.dispatch("get_video", {"video_id": 3}, ctx, registry, ledger)

        self.assertEqual(get_video.execute.call_count, 2)


if __name__ == "__main__":
    unittest.main()
