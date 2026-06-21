"""Agentic (tool-using) implementation of :class:`RagGateway` (§3.1, §4.2, §8).

``AgenticChatGateway`` replaces the fixed single-shot retrieval of
``RagChatGateway`` with a bounded tool-calling loop. Instead of retrieving a
fixed set of scenes up front, it lets the LLM drive retrieval through the three
allowlisted tools published by :class:`AgentToolDispatcher`
(``search_scenes`` / ``get_video`` / ``list_catalog``), then renumbers the
citations the model actually used into the domain ``CitationDTO`` ordinal
contract (§8.1).

Design constraints mirrored from ``RagChatGateway`` (`rag_gateway.py`):

* Pre-flight is identical: resolve the user via ``get_user_model`` (raising
  :class:`RagUserNotFoundError`), build the LLM via the injected factory
  (``ProviderConfigError`` -> :class:`LLMConfigurationError`), and wrap provider
  failures as :class:`LLMProviderError` (OpenAI auth failures ->
  :class:`LLMConfigurationError`).
* Only the **latest user message** drives the turn; conversation history is out
  of scope (§6), replicating ``_extract_latest_user_query``.
* The public :class:`RagGateway` signatures stay byte-identical.

The loop never raises on a budget/limit hit: it degrades to a tool-free final
answer (§3.1 step 6). Tool-level failures surface as ``ToolMessage`` content so
the model can recover, not as HTTP errors (§5.1, §9.1).

``get_langchain_llm`` is imported into this module's namespace so tests can patch
``app.infrastructure.external.agentic.agentic_gateway.get_langchain_llm``.
"""

import logging
import time
from typing import Iterator, List, Optional, Sequence

from django.contrib.auth import get_user_model
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from openai import AuthenticationError as OpenAIAuthenticationError

from app.domain.chat.dtos import ChatMessageDTO, CitationDTO
from app.domain.chat.gateways import (
    LLMConfigurationError,
    LLMProviderError,
    RagGateway,
    RagResult,
    RagStreamChunk,
    RagUserNotFoundError,
)
from app.domain.shared.exceptions import ProviderConfigError
from app.infrastructure.external.agentic.agent_config import (
    AgentBudget,
    AgentToolError,
)
from app.infrastructure.external.agentic.agent_tools import AgentToolDispatcher
from app.infrastructure.external.agentic.citation_registry import CitationRegistry
from app.infrastructure.external.agentic.context_collector import ContextLedger
from app.infrastructure.external.agentic.dtos import AgentToolContext
from app.infrastructure.external.agentic.token_counter import count_tokens
from app.infrastructure.external.llm import get_langchain_llm
from app.infrastructure.external.prompts.loader import (
    build_system_prompt,
    get_agent_security_rules,
)

logger = logging.getLogger(__name__)

#: Cap on the number of natural-language fragments returned as
#: ``retrieved_contexts`` (§10.1; mirrors ``ContextLedger`` cap).
_MAX_RETRIEVED_CONTEXTS = 30


class AgenticChatGateway(RagGateway):
    """Tool-using :class:`RagGateway` driven by :class:`AgentToolDispatcher`.

    The gateway owns the bounded agent loop; the dispatcher owns the security
    boundary (allowlist + scope injection). The LLM is built per request via the
    injected ``llm_factory`` so per-user API keys are honoured.
    """

    def __init__(
        self,
        *,
        dispatcher: AgentToolDispatcher,
        max_iterations: int = 6,
        llm_factory=None,
        budget: AgentBudget,
    ) -> None:
        """Initialise the gateway.

        Args:
            dispatcher: The :class:`AgentToolDispatcher` providing tool schemas
                and validated dispatch.
            max_iterations: Fallback iteration cap used only when ``budget`` does
                not constrain the loop more tightly. ``budget.max_tool_iterations``
                takes precedence inside the loop.
            llm_factory: Optional callable ``(*, api_key) -> BaseChatModel`` used
                to build the LLM per request. When ``None`` (the default) the
                module-level :func:`get_langchain_llm` is resolved *at call time*
                so tests patching
                ``...agentic_gateway.get_langchain_llm`` take effect (a default
                argument value would be captured at import time and bypass the
                patch).
            budget: Per-turn :class:`AgentBudget` (§7.3 limits).
        """
        self._dispatcher = dispatcher
        self._max_iterations = max_iterations
        self._llm_factory = llm_factory
        self._budget = budget

    # ------------------------------------------------------------------
    # Pre-flight (mirrors RagChatGateway)
    # ------------------------------------------------------------------
    def _resolve_user(self, user_id: int):
        """Resolve the request user or raise :class:`RagUserNotFoundError`."""
        User = get_user_model()
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise RagUserNotFoundError(f"User not found: {user_id}") from exc

    def _build_llm(self, api_key: Optional[str]):
        """Build the LLM via the injected factory (config errors -> 400).

        Resolves the module-level :func:`get_langchain_llm` at call time when no
        explicit ``llm_factory`` was injected, so patches of
        ``...agentic_gateway.get_langchain_llm`` are honoured.
        """
        factory = self._llm_factory or get_langchain_llm
        try:
            return factory(api_key=api_key)
        except ProviderConfigError as e:
            raise LLMConfigurationError(str(e)) from e

    def _build_system_prompt(
        self, locale: Optional[str], group_context: Optional[str]
    ) -> str:
        """Compose the agentic system prompt (§6, §8.4, §9.1).

        References are left empty (the agent retrieves dynamically). The base
        prompt is augmented with the prompt-injection / tool-scope defence rules
        and the explicit tool-usage + appearance-order citation instruction.
        """
        base = build_system_prompt(
            locale=locale,
            references=[],
            group_context=group_context,
        )
        security_rules = get_agent_security_rules(locale)

        lines: List[str] = [base, ""]
        lines.append("# Tool Usage")
        lines.append(
            "You have exactly three tools available: search_scenes, get_video, "
            "and list_catalog. Use them to gather evidence before answering; do "
            "not rely on prior knowledge that is not grounded in their results."
        )
        lines.append(
            "Cite supporting scenes inline as [N] in order of first appearance, "
            "numbering from 1. The first scene you cite is [1], the next new "
            "scene is [2], and so on."
        )
        if security_rules:
            lines.append("")
            lines.append("# Security Rules")
            for idx, rule in enumerate(security_rules, start=1):
                lines.append(f"{idx}. {rule}")
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Trace helper
    # ------------------------------------------------------------------
    @staticmethod
    def _trace_entry(name, args, content: str, latency_ms: int) -> dict:
        """Build a single ``tool_trace`` entry (§7.3)."""
        if isinstance(content, str):
            result_tokens = count_tokens(content)
        else:
            result_tokens = 0
        return {
            "tool": name,
            "args": args or {},
            "result_kind": "error" if content is None else "ok",
            "result_tokens": result_tokens,
            "latency_ms": latency_ms,
        }

    def _merge_retrieved_contexts(
        self, registry_contexts: Sequence[str], ledger: ContextLedger
    ) -> List[str]:
        """Merge registry (cited-scene) texts with ledger catalog/context (§10.1).

        Prefers the registry's surviving-scene texts (citation-aligned) first,
        then appends the ledger's normalized contexts, deduping order-preservingly
        and capping at 30.
        """
        merged: List[str] = []
        seen = set()
        for text in list(registry_contexts) + ledger.to_retrieved_contexts():
            if not text or text in seen:
                continue
            seen.add(text)
            merged.append(text)
            if len(merged) >= _MAX_RETRIEVED_CONTEXTS:
                break
        return merged

    @staticmethod
    def _filter_citations(
        citations: List[CitationDTO], ctx: AgentToolContext
    ) -> List[CitationDTO]:
        """Drop citations whose ``video_id`` is out of scope (§9.2)."""
        allowed = set(ctx.video_ids)
        return [c for c in citations if c.video_id in allowed]

    # ------------------------------------------------------------------
    # Tool loop
    # ------------------------------------------------------------------
    def _run_tool_loop(self, bound, conversation, ctx, registry, ledger, tool_trace):
        """Drive the bounded tool-calling loop (§3.1 steps 4-5).

        Invokes the tool-bound LLM repeatedly, dispatching every requested tool
        call until the model returns a final (tool-call-free) answer or a budget
        limit is hit.

        Args:
            bound: The tool-bound LLM (``llm.bind_tools(...)``).
            conversation: Mutable message buffer (appended in place).
            ctx: Fixed :class:`AgentToolContext` scope.
            registry: Active :class:`CitationRegistry`.
            ledger: Active :class:`ContextLedger`.
            tool_trace: Mutable list of trace entries (appended in place).

        Returns:
            ``True`` if a natural (tool-free) final answer was produced, ``False``
            if the loop hit a limit and a forced final answer is required.
        """
        budget = self._budget
        max_iterations = min(budget.max_tool_iterations, self._max_iterations)
        llm_calls = 0

        for _ in range(max_iterations):
            if llm_calls >= budget.max_llm_calls:
                return False
            ai = bound.invoke(conversation)
            llm_calls += 1
            conversation.append(ai)

            tool_calls = getattr(ai, "tool_calls", None)
            if not tool_calls:
                return True

            for tool_call in tool_calls:
                name = tool_call.get("name")
                args = tool_call.get("args") or {}
                call_id = tool_call.get("id")
                start = time.monotonic()
                try:
                    result = self._dispatcher.dispatch(
                        name, args, ctx, registry, ledger
                    )
                    content = result.content
                except AgentToolError as exc:
                    # Surface the error to the model so it can recover (§5.1).
                    content = str(exc)
                latency_ms = int((time.monotonic() - start) * 1000)
                conversation.append(
                    ToolMessage(content=content, tool_call_id=call_id)
                )
                tool_trace.append(
                    self._trace_entry(name, args, content, latency_ms)
                )

        # Exhausted the iteration budget without a final answer.
        return False

    @staticmethod
    def _force_final_message(conversation) -> None:
        """Append the §3.1-step-6 "limit reached, answer without tools" nudge."""
        conversation.append(
            SystemMessage(
                content=(
                    "上限到達。ツールを使わずこれまでの情報のみで回答せよ。"
                )
            )
        )

    @staticmethod
    def _content_to_text(content) -> str:
        """Coerce an AIMessage content (str or list) into plain text."""
        return content if isinstance(content, str) else str(content)

    # ------------------------------------------------------------------
    # generate_reply
    # ------------------------------------------------------------------
    def generate_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
    ) -> RagResult:
        self._resolve_user(user_id)
        llm = self._build_llm(api_key)

        query = _extract_latest_user_query(messages)
        system_prompt = self._build_system_prompt(locale, group_context or None)
        conversation: List = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=query),
        ]

        ctx = AgentToolContext(
            user_id=user_id,
            video_ids=tuple(video_ids or ()),
            locale=locale,
        )
        registry = CitationRegistry()
        ledger = ContextLedger()
        self._dispatcher.reset_turn()
        tool_trace: List[dict] = []

        try:
            bound = llm.bind_tools(self._dispatcher.tool_schemas())
            answered = self._run_tool_loop(
                bound, conversation, ctx, registry, ledger, tool_trace
            )

            if answered:
                final_ai = conversation[-1]
            else:
                # Forced tool-free final answer (§3.1 step 6) — never raise.
                self._force_final_message(conversation)
                final_ai = llm.invoke(conversation)

            answer_text = self._content_to_text(getattr(final_ai, "content", ""))
        except OpenAIAuthenticationError as exc:
            raise LLMConfigurationError(
                "Invalid OpenAI API key. Please check your API key in Settings."
            ) from exc
        except (RagUserNotFoundError, LLMConfigurationError):
            raise
        except Exception as exc:
            logger.exception("Agentic generate_reply failed: %s", exc)
            raise LLMProviderError(str(exc)) from exc

        renumbered_text, citations, registry_contexts = registry.finalize(
            answer_text
        )
        citations = self._filter_citations(citations, ctx)
        retrieved_contexts = self._merge_retrieved_contexts(
            registry_contexts, ledger
        )

        return RagResult(
            content=renumbered_text,
            query_text=query,
            citations=citations or None,
            retrieved_contexts=retrieved_contexts,
            tool_trace=tool_trace,
        )

    # ------------------------------------------------------------------
    # stream_reply
    # ------------------------------------------------------------------
    def stream_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
    ) -> Iterator[RagStreamChunk]:
        self._resolve_user(user_id)
        llm = self._build_llm(api_key)

        query = _extract_latest_user_query(messages)
        system_prompt = self._build_system_prompt(locale, group_context or None)
        conversation: List = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=query),
        ]

        ctx = AgentToolContext(
            user_id=user_id,
            video_ids=tuple(video_ids or ()),
            locale=locale,
        )
        registry = CitationRegistry()
        ledger = ContextLedger()
        self._dispatcher.reset_turn()
        tool_trace: List[dict] = []

        try:
            bound = llm.bind_tools(self._dispatcher.tool_schemas())
            answered = self._run_tool_loop(
                bound, conversation, ctx, registry, ledger, tool_trace
            )

            if answered:
                # Re-issue the final answer turn as a stream. The last AIMessage
                # in the buffer was tool-call-free; drop it and re-stream the
                # final turn so tokens can be emitted (§7.4 chosen approach).
                last = conversation[-1]
                if isinstance(last, AIMessage) and not getattr(
                    last, "tool_calls", None
                ):
                    conversation = conversation[:-1]
                stream_source = bound
            else:
                self._force_final_message(conversation)
                stream_source = llm

            # Only the FINAL answer turn streams (§7.4). Registration-order
            # numbering means streamed [n] are already correct (§8.4 option A),
            # so tokens are emitted verbatim without mid-stream rewriting. The
            # text is accumulated so finalize() can prune uncited refs.
            streamed_parts: List[str] = []
            for chunk in stream_source.stream(conversation):
                content = getattr(chunk, "content", None)
                if isinstance(content, str) and content:
                    streamed_parts.append(content)
                    yield RagStreamChunk(text=content)
            streamed_text = "".join(streamed_parts)
        except OpenAIAuthenticationError as exc:
            raise LLMConfigurationError(
                "Invalid OpenAI API key. Please check your API key in Settings."
            ) from exc
        except (RagUserNotFoundError, LLMConfigurationError):
            raise
        except Exception as exc:
            logger.exception("Agentic stream_reply failed: %s", exc)
            raise LLMProviderError(str(exc)) from exc

        # Finalize once the stream is exhausted. Citations are aligned to the
        # streamed [n] tokens via registration-order numbering, so finalize only
        # prunes uncited refs and drops out-of-scope citations (§8.4, §9.2).
        # The accumulated streamed text is scanned for the surviving [n] tokens.
        _renumbered, citations, registry_contexts = registry.finalize(streamed_text)
        citations = self._filter_citations(citations, ctx)
        retrieved_contexts = self._merge_retrieved_contexts(
            registry_contexts, ledger
        )
        yield RagStreamChunk(
            is_final=True,
            citations=citations or None,
            query_text=query,
            retrieved_contexts=retrieved_contexts,
            tool_trace=tool_trace,
        )


def _extract_latest_user_query(messages: Sequence[ChatMessageDTO]) -> str:
    """Return the latest user message content (§6).

    Replicates ``RagChatService._extract_latest_user_query`` (rag_service.py:
    139-145): conversation history is out of scope, so only the most recent user
    turn drives the tool loop.

    Args:
        messages: Conversation history as typed DTO messages.

    Returns:
        The latest user message content, or the last message's content as a
        fallback, or an empty string.
    """
    for message in reversed(messages):
        if message.role == "user" and message.content:
            return message.content
    if messages:
        return messages[-1].content or ""
    return ""
