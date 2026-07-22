"""Bounded tool-calling loop for group-scoped video Q&A."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Sequence, Union

from django.conf import settings
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.infrastructure.external.prompts import build_system_prompt, get_qa_agent_config
from app.infrastructure.external.qa_agent.tools import QaSceneToolkit, SceneHit

logger = logging.getLogger(__name__)

_MAX_FINAL_SCENES = 20


@dataclass
class QaToolAgentResult:
    """Non-streaming agent result (mirrors RagChatResult fields we need)."""

    content: str
    query_text: str
    citations: Optional[List[Dict[str, str]]]
    retrieved_contexts: List[str] = field(default_factory=list)


@dataclass
class _QaAgentStreamEnd:
    citations: Optional[List[Dict[str, str]]]
    query_text: str
    retrieved_contexts: List[str] = field(default_factory=list)


def is_qa_agent_enabled() -> bool:
    """True when the agent path should be used for this process config."""
    if not getattr(settings, "QA_AGENT_ENABLED", False):
        return False
    provider = str(getattr(settings, "LLM_PROVIDER", "openai") or "openai").lower()
    # Tool calling is only enabled for OpenAI; other providers fall back to classic RAG.
    return provider == "openai"


class QaToolAgent:
    """Run a bounded bind_tools loop, then stream a citation-grounded answer."""

    def __init__(
        self,
        *,
        user_id: int,
        llm: BaseChatModel,
        video_ids: Optional[Sequence[int]] = None,
    ) -> None:
        self.user_id = int(user_id)
        self.llm = llm
        self.video_ids = list(video_ids) if video_ids is not None else []
        self.toolkit = QaSceneToolkit(
            user_id=self.user_id,
            allowed_video_ids=self.video_ids,
        )

    def run(
        self,
        messages: Sequence[Dict[str, str]],
        locale: Optional[str] = None,
        group_context: Optional[str] = None,
    ) -> QaToolAgentResult:
        query_text = self._extract_latest_user_query(messages)
        self._prepare_evidence(query_text, locale=locale)
        refs, citations, contexts = self._build_evidence_payload()
        final_messages = self._build_final_messages(
            query_text=query_text,
            locale=locale,
            group_context=group_context,
            references=refs,
        )
        response = self.llm.invoke(final_messages)
        content = response.content
        content_text = content if isinstance(content, str) else str(content)
        return QaToolAgentResult(
            content=content_text,
            query_text=query_text,
            citations=citations,
            retrieved_contexts=contexts,
        )

    def stream(
        self,
        messages: Sequence[Dict[str, str]],
        locale: Optional[str] = None,
        group_context: Optional[str] = None,
    ) -> Iterator[Union[str, _QaAgentStreamEnd]]:
        query_text = self._extract_latest_user_query(messages)
        self._prepare_evidence(query_text, locale=locale)
        refs, citations, contexts = self._build_evidence_payload()
        final_messages = self._build_final_messages(
            query_text=query_text,
            locale=locale,
            group_context=group_context,
            references=refs,
        )
        for chunk in self.llm.stream(final_messages):
            content = getattr(chunk, "content", None)
            if isinstance(content, str) and content:
                yield content
        yield _QaAgentStreamEnd(
            citations=citations,
            query_text=query_text,
            retrieved_contexts=contexts,
        )

    def _prepare_evidence(self, query_text: str, *, locale: Optional[str]) -> None:
        """Load catalog for inventory answers, then run the tool-calling loop."""
        if not self.video_ids:
            return
        self.toolkit.load_video_catalog()
        self._run_tool_loop(query_text, locale=locale)

    def _run_tool_loop(self, query_text: str, *, locale: Optional[str]) -> None:
        max_rounds = int(getattr(settings, "QA_AGENT_MAX_ROUNDS", 3) or 3)
        max_rounds = max(1, min(max_rounds, 8))
        tools = self.toolkit.as_langchain_tools()
        tools_by_name = {tool.name: tool for tool in tools}
        llm_with_tools = self.llm.bind_tools(tools)

        agent_cfg = get_qa_agent_config(locale)
        system_text = str(agent_cfg.get("system") or "").strip()
        if not system_text:
            system_text = (
                "You gather video-scene evidence with tools, then stop. "
                "Do not write the final user-facing answer yet."
            )

        chat_messages: List[Any] = [
            SystemMessage(content=system_text),
            HumanMessage(content=query_text),
        ]

        for _ in range(max_rounds):
            ai_message = llm_with_tools.invoke(chat_messages)
            if not isinstance(ai_message, AIMessage):
                break
            chat_messages.append(ai_message)
            tool_calls = getattr(ai_message, "tool_calls", None) or []
            if not tool_calls:
                break
            for call in tool_calls:
                name = (
                    call.get("name") if isinstance(call, dict) else getattr(call, "name", "")
                )
                call_id = (
                    call.get("id") if isinstance(call, dict) else getattr(call, "id", "")
                ) or name
                args = (
                    call.get("args")
                    if isinstance(call, dict)
                    else getattr(call, "args", {})
                ) or {}
                tool = tools_by_name.get(str(name))
                if tool is None:
                    observation = '{"error":"unknown_tool"}'
                else:
                    try:
                        observation = tool.invoke(args)
                    except Exception as exc:
                        logger.exception("QA agent tool %s failed", name)
                        observation = f'{{"error":"tool_failed","detail":"{exc}"}}'
                if not isinstance(observation, str):
                    observation = str(observation)
                chat_messages.append(
                    ToolMessage(content=observation, tool_call_id=str(call_id))
                )

    def _build_evidence_payload(
        self,
    ) -> tuple[List[str], Optional[List[Dict[str, str]]], List[str]]:
        scenes = self.toolkit.collected_scenes[:_MAX_FINAL_SCENES]
        if scenes:
            references = [
                self._format_reference(i, scene) for i, scene in enumerate(scenes, 1)
            ]
            citations = [
                {
                    "video_id": str(scene.video_id),
                    "title": scene.video_title,
                    "start_time": scene.start_time,
                    "end_time": scene.end_time,
                }
                for scene in scenes
            ]
            contexts = [scene.page_content for scene in scenes]
            return references, citations, contexts

        # Inventory-only evidence: keep catalog answerable without "out of scope".
        catalog = self.toolkit.video_catalog
        if not catalog:
            return [], None, []
        catalog_lines = [
            f"- video_id={row['video_id']}: {row['title']}" for row in catalog
        ]
        references = [
            "[Catalog] Videos in this group (titles only; not timed scenes):\n"
            + "\n".join(catalog_lines)
        ]
        citations = [
            {
                "video_id": str(row["video_id"]),
                "title": str(row["title"]),
                "start_time": "",
                "end_time": "",
            }
            for row in catalog
        ]
        contexts = [str(row["title"]) for row in catalog]
        return references, citations, contexts

    @staticmethod
    def _format_reference(index: int, scene: SceneHit) -> str:
        return (
            f"[{index}] {scene.video_title} {scene.start_time} - {scene.end_time}\n"
            f"{scene.page_content}"
        )

    def _build_final_messages(
        self,
        *,
        query_text: str,
        locale: Optional[str],
        group_context: Optional[str],
        references: Sequence[str],
    ) -> List[Any]:
        catalog = self.toolkit.video_catalog
        catalog_block = ""
        if catalog:
            lines = [f"- {row['title']} (video_id={row['video_id']})" for row in catalog]
            catalog_block = "Group Video Catalog:\n" + "\n".join(lines)

        merged_context_parts = [p for p in (group_context, catalog_block) if p and p.strip()]
        merged_context = "\n\n".join(merged_context_parts) or None

        system_prompt = build_system_prompt(
            locale=locale,
            references=list(references),
            group_context=merged_context,
        )
        # Catalog is valid evidence for inventory questions (overrides empty-scene refusal).
        if catalog:
            if locale and str(locale).lower().startswith("ja"):
                system_prompt += (
                    "\n\n# 追加ルール（グループ動画カタログ）\n"
                    "1. 「どんな講座/動画があるか」「一覧」などグループ内の動画名を尋ねる質問は、"
                    "Group Video Catalog を根拠に必ず答えてください。範囲外と言ってはいけません。\n"
                    "2. 動画の中身・説明内容を尋ねられたときは参照シーンを優先し、"
                    "カタログのタイトルだけで詳細を捏造しないでください。\n"
                )
            else:
                system_prompt += (
                    "\n\n# Additional rules (group video catalog)\n"
                    "1. Questions about which lectures/videos are in the group MUST be answered "
                    "from the Group Video Catalog; do not say they are out of scope.\n"
                    "2. For questions about video content, prefer Reference Scenes; "
                    "do not invent details from titles alone.\n"
                )
        return [
            SystemMessage(content=system_prompt),
            HumanMessage(content=query_text),
        ]

    @staticmethod
    def _extract_latest_user_query(messages: Sequence[Dict[str, str]]) -> str:
        for msg in reversed(messages):
            if msg.get("role") == "user" and msg.get("content"):
                return msg["content"]
        if messages:
            return messages[-1].get("content", "") or ""
        return ""
