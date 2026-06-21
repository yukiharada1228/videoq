"""Tests for the agentic (tool-using) chat gateway (§11.1).

Modeled on ``test_rag_chat.py``: the LLM is patched at the canonical module
(``app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm``) and a
real :class:`AgentToolDispatcher` is driven with fake use cases returning canned
data, so no vector store / database retrieval is exercised.

Covered:

* ``generate_reply`` returns a :class:`RagResult` with content, citations, and a
  non-empty ``tool_trace``.
* ``stream_reply`` yields content chunks followed by a single ``is_final`` chunk.
* Loop limit: an LLM that always emits ``tool_calls`` still terminates via the
  forced tool-free final answer (no infinite loop).
* Error propagation: a tool/LLM ``RuntimeError`` surfaces as
  :class:`LLMProviderError` (mirrors ``test_rag_chat.py``).
* A missing user raises :class:`RagUserNotFoundError`.
"""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from langchain_core.messages import AIMessage

from app.domain.chat.dtos import ChatMessageDTO
from app.domain.chat.gateways import (
    LLMProviderError,
    RagResult,
    RagUserNotFoundError,
    SceneSearchResultDTO,
)
from app.infrastructure.external.agentic.agent_config import AgentBudget
from app.infrastructure.external.agentic.agent_tools import AgentToolDispatcher
from app.infrastructure.external.agentic.agentic_gateway import AgenticChatGateway

User = get_user_model()


# ---------------------------------------------------------------------------
# Fakes for the injected use cases (no infrastructure / DB access).
# ---------------------------------------------------------------------------
class _FakeSearchResult:
    """Stand-in for ``SearchScenesResultDTO`` (carries ``results``)."""

    def __init__(self, results):
        self.results = results


class FakeSearchScenesUseCase:
    """Returns one canned scene so ``search_scenes`` registers a citation."""

    def __init__(self, scenes):
        self._scenes = scenes
        self.calls = []

    def execute(self, *, user_id, video_ids, query, k):
        self.calls.append({"user_id": user_id, "video_ids": video_ids, "query": query, "k": k})
        return _FakeSearchResult(self._scenes)


class _FakeVideoDTO:
    def __init__(self, video_id, title, transcript):
        self.id = video_id
        self.title = title
        self.transcript = transcript


class FakeGetVideoUseCase:
    """Returns a canned video DTO (no ``llm`` attr -> truncated transcript)."""

    def __init__(self, video):
        self._video = video

    def execute(self, video_id, user_id):
        return self._video


class _FakePage:
    def __init__(self, results, count=None):
        self.results = results
        self.count = count if count is not None else len(results)


class FakeListVideosUseCase:
    def execute_page(self, user_id, input, *, limit, offset):
        return _FakePage([])


class FakeListGroupsUseCase:
    def execute_page(self, user_id, *, include_videos, limit, offset):
        return _FakePage([])


class FakeListTagsUseCase:
    def execute(self, *, user_id):
        return []


def _make_dispatcher():
    """Build a real dispatcher wired to fakes returning canned scene data."""
    scene = SceneSearchResultDTO(
        video_id=1,
        video_title="Test Video",
        start_time="00:00:10,000",
        end_time="00:00:20,000",
        start_sec=10.0,
        end_sec=20.0,
        scene_index=0,
        text="A pinpoint scene about the topic.",
    )
    return AgentToolDispatcher(
        search_scenes_use_case=FakeSearchScenesUseCase([scene]),
        get_video_use_case=FakeGetVideoUseCase(
            _FakeVideoDTO(1, "Test Video", "Full transcript text.")
        ),
        list_videos_use_case=FakeListVideosUseCase(),
        list_groups_use_case=FakeListGroupsUseCase(),
        list_tags_use_case=FakeListTagsUseCase(),
        budget=AgentBudget(),
    )


def _tool_call_message():
    """An AIMessage requesting one ``search_scenes`` tool call."""
    return AIMessage(
        content="",
        tool_calls=[
            {
                "name": "search_scenes",
                "args": {"query": "the topic"},
                "id": "call_1",
                "type": "tool_call",
            }
        ],
    )


def _final_message():
    """A tool-call-free final AIMessage citing the registered scene as [1]."""
    return AIMessage(content="Here is the answer [1].")


@override_settings(LLM_PROVIDER="openai")
class AgenticChatGatewayTests(TestCase):
    """generate_reply / stream_reply happy paths and limits."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="agentic_user",
            email="agentic@example.com",
            password="testpass123",
        )
        self.messages = [ChatMessageDTO(role="user", content="Tell me about the topic")]

    def _gateway(self):
        return AgenticChatGateway(dispatcher=_make_dispatcher(), budget=AgentBudget())

    @patch("app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm")
    def test_generate_reply_returns_content_citations_and_tool_trace(self, mock_get_llm):
        """generate_reply returns content + citations + non-empty tool_trace."""
        mock_llm = MagicMock()
        bound = MagicMock()
        # First invoke -> tool call; second invoke -> final answer.
        bound.invoke.side_effect = [_tool_call_message(), _final_message()]
        mock_llm.bind_tools.return_value = bound
        mock_get_llm.return_value = mock_llm

        result = self._gateway().generate_reply(
            messages=self.messages,
            user_id=self.user.id,
            video_ids=[1],
        )

        self.assertIsInstance(result, RagResult)
        self.assertIn("answer", result.content)
        self.assertTrue(result.citations)
        self.assertEqual(result.citations[0].video_id, 1)
        # One search_scenes dispatch was traced.
        self.assertTrue(result.tool_trace)
        self.assertEqual(result.tool_trace[0]["tool"], "search_scenes")
        self.assertEqual(result.tool_trace[0]["result_kind"], "ok")

    @patch("app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm")
    def test_stream_reply_yields_content_then_single_final(self, mock_get_llm):
        """stream_reply yields content chunks then exactly one is_final chunk."""
        mock_llm = MagicMock()
        bound = MagicMock()
        # Tool loop: first invoke -> tool call, second invoke -> tool-free answer.
        bound.invoke.side_effect = [_tool_call_message(), _final_message()]

        def _fake_stream(_conversation):
            yield AIMessage(content="Here is ")
            yield AIMessage(content="the answer [1].")

        # answered=True path re-streams the final turn on the bound model.
        bound.stream.side_effect = _fake_stream
        mock_llm.bind_tools.return_value = bound
        mock_get_llm.return_value = mock_llm

        chunks = list(
            self._gateway().stream_reply(
                messages=self.messages,
                user_id=self.user.id,
                video_ids=[1],
            )
        )

        content_chunks = [c for c in chunks if c.text is not None]
        self.assertEqual(
            "".join(c.text for c in content_chunks), "Here is the answer [1]."
        )

        final_chunks = [c for c in chunks if c.is_final]
        self.assertEqual(len(final_chunks), 1)
        self.assertEqual(final_chunks[0].query_text, "Tell me about the topic")
        self.assertTrue(final_chunks[0].tool_trace)
        # is_final chunk carries no text.
        self.assertIsNone(final_chunks[0].text)

    @patch("app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm")
    def test_loop_limit_terminates_with_forced_final_answer(self, mock_get_llm):
        """An LLM that always emits tool_calls still terminates (no infinite loop)."""
        mock_llm = MagicMock()
        bound = MagicMock()
        # Always request a tool call -> loop exhausts and forces a tool-free turn.
        bound.invoke.return_value = _tool_call_message()
        mock_llm.bind_tools.return_value = bound
        # Forced final answer is produced by the *unbound* llm.invoke.
        mock_llm.invoke.return_value = AIMessage(content="Forced final answer.")
        mock_get_llm.return_value = mock_llm

        result = self._gateway().generate_reply(
            messages=self.messages,
            user_id=self.user.id,
            video_ids=[1],
        )

        self.assertIsInstance(result, RagResult)
        self.assertEqual(result.content, "Forced final answer.")
        # The forced tool-free final turn was taken from the unbound model.
        mock_llm.invoke.assert_called_once()
        # bind_tools invoke was capped (did not loop forever).
        budget = AgentBudget()
        self.assertLessEqual(bound.invoke.call_count, budget.max_tool_iterations)

    @patch("app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm")
    def test_llm_runtime_error_becomes_llm_provider_error(self, mock_get_llm):
        """A RuntimeError from the LLM surfaces as LLMProviderError."""
        mock_llm = MagicMock()
        bound = MagicMock()
        bound.invoke.side_effect = RuntimeError("LLM exploded")
        mock_llm.bind_tools.return_value = bound
        mock_get_llm.return_value = mock_llm

        with self.assertRaises(LLMProviderError):
            self._gateway().generate_reply(
                messages=self.messages,
                user_id=self.user.id,
                video_ids=[1],
            )

    @patch("app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm")
    def test_stream_runtime_error_becomes_llm_provider_error(self, mock_get_llm):
        """A RuntimeError raised mid-stream surfaces as LLMProviderError."""
        mock_llm = MagicMock()
        bound = MagicMock()
        # Go straight to a tool-free final answer so streaming happens on bound.
        bound.invoke.return_value = _final_message()

        def _boom(_conversation):
            yield AIMessage(content="partial")
            raise RuntimeError("stream died")

        bound.stream.side_effect = _boom
        mock_llm.bind_tools.return_value = bound
        mock_get_llm.return_value = mock_llm

        with self.assertRaises(LLMProviderError):
            list(
                self._gateway().stream_reply(
                    messages=self.messages,
                    user_id=self.user.id,
                    video_ids=[1],
                )
            )

    @patch("app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm")
    def test_generate_reply_raises_for_missing_user(self, mock_get_llm):
        """A non-existent user raises RagUserNotFoundError before LLM use."""
        with self.assertRaises(RagUserNotFoundError):
            self._gateway().generate_reply(
                messages=self.messages,
                user_id=999999,
                video_ids=[1],
            )
        mock_get_llm.assert_not_called()

    @patch("app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm")
    def test_stream_reply_raises_for_missing_user(self, mock_get_llm):
        """A non-existent user raises RagUserNotFoundError before streaming."""
        with self.assertRaises(RagUserNotFoundError):
            list(
                self._gateway().stream_reply(
                    messages=self.messages,
                    user_id=999999,
                    video_ids=[1],
                )
            )
        mock_get_llm.assert_not_called()
