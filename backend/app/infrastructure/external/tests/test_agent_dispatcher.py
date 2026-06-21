"""Allowlist / blocklist tests for ``AgentToolDispatcher`` (spec §9.4).

The dispatcher is the single security boundary between the LLM's tool-call
requests and the application's use cases. These tests pin the publishable tool
surface to exactly three tools and assert that the admin/analytics MCP tools are
never reachable from agentic chat, and that dispatching a disallowed tool name
fails fast with an :class:`AgentToolError`.
"""

import unittest

from app.infrastructure.external.agentic.agent_config import (
    AgentBudget,
    AgentToolError,
)
from app.infrastructure.external.agentic.agent_tools import AgentToolDispatcher
from app.infrastructure.external.agentic.citation_registry import CitationRegistry
from app.infrastructure.external.agentic.context_collector import ContextLedger
from app.infrastructure.external.agentic.dtos import AgentToolContext


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


if __name__ == "__main__":
    unittest.main()
