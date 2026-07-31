"""
LangChain RAG service implementation.
Moved from app/chat/services/rag_chat.py.
"""

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from typing import (
    TYPE_CHECKING,
    Any,
    Optional,
    cast,
)

from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_postgres import PGVectorStore

from app.infrastructure.common.embeddings import get_embeddings
from app.infrastructure.external.prompts import build_system_prompt
from app.infrastructure.external.vector_store import PGVectorManager

if TYPE_CHECKING:  # pragma: no cover
    from app.infrastructure.models import VideoGroup


@dataclass
class RagChatResult:
    """RAG execution result."""

    llm_response: AIMessage
    query_text: str
    citations: list[dict[str, str]] | None
    retrieved_contexts: list[str] = None  # type: ignore[assignment]

    def __post_init__(self):
        if self.retrieved_contexts is None:
            self.retrieved_contexts = []


@dataclass
class _RagServiceStreamEnd:
    """Sentinel yielded at the end of RagChatService.stream() carrying metadata."""

    citations: list[dict[str, str]] | None
    query_text: str
    retrieved_contexts: list[str] = None  # type: ignore[assignment]

    def __post_init__(self):
        if self.retrieved_contexts is None:
            self.retrieved_contexts = []


class RagChatService:
    """Service class that handles RAG logic for chat."""

    def __init__(self, user, llm=None, api_key=None):
        self.user = user
        self.llm = llm
        self._api_key = api_key
        self.prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "{system_prompt}"),
                ("human", "{query_text}"),
            ]
        )

    def run(
        self,
        messages: Sequence[dict[str, str]],
        group: Optional["VideoGroup"] = None,
        locale: str | None = None,
        video_ids: list[int] | None = None,
        group_context: str | None = None,
    ) -> RagChatResult:
        if self.llm is None:
            raise RuntimeError("LLM is required for full RAG response generation.")

        query_text = self._extract_latest_user_query(messages)
        retriever = self._get_retriever(group, video_ids=video_ids)

        # Retrieve docs upfront to capture page_content for evaluation.
        docs: list[Any] = retriever.invoke(query_text) if retriever is not None else []

        payload = self._build_prompt_payload({
            "docs": docs,
            "query_text": query_text,
            "locale": locale,
            "group_context": group_context,
        })
        citations = payload["citations"]
        prompt_messages = self.prompt.invoke(payload["prompt_input"])
        llm_response = cast(AIMessage, self.llm.invoke(prompt_messages))

        return RagChatResult(
            llm_response=llm_response,
            query_text=query_text,
            citations=citations,
            retrieved_contexts=self._extract_page_contents(docs),
        )

    def stream(
        self,
        messages: Sequence[dict[str, str]],
        group: Optional["VideoGroup"] = None,
        locale: str | None = None,
        video_ids: list[int] | None = None,
        group_context: str | None = None,
    ) -> Iterator[str | _RagServiceStreamEnd]:
        """Stream LLM response token by token.

        Yields:
            - ``str`` for each content token from the LLM.
            - ``_RagServiceStreamEnd`` as the final sentinel with citations + query_text.
        """
        if self.llm is None:
            raise RuntimeError("LLM is required for streaming.")

        query_text = self._extract_latest_user_query(messages)
        retriever = self._get_retriever(group, video_ids=video_ids)

        docs = retriever.invoke(query_text) if retriever is not None else []

        payload = self._build_prompt_payload({
            "docs": docs,
            "query_text": query_text,
            "locale": locale,
            "group_context": group_context,
        })
        citations = payload["citations"]
        retrieved_contexts = self._extract_page_contents(docs)
        prompt_messages = self.prompt.invoke(payload["prompt_input"])

        for chunk in self.llm.stream(prompt_messages):
            content = chunk.content
            if isinstance(content, str) and content:
                yield content

        yield _RagServiceStreamEnd(
            citations=citations,
            query_text=query_text,
            retrieved_contexts=retrieved_contexts,
        )

    def _extract_latest_user_query(self, messages: Sequence[dict[str, str]]) -> str:
        for msg in reversed(messages):
            if msg.get("role") == "user" and msg.get("content"):
                return msg["content"]
        if messages:
            return messages[-1].get("content", "") or ""
        return ""

    def _get_retriever(
        self,
        group: Optional["VideoGroup"] = None,
        video_ids: list[int] | None = None,
    ) -> Any | None:
        # Resolve the list of video IDs from whichever source is provided
        if video_ids is not None:
            group_video_ids = video_ids
        elif group is not None:
            group_video_ids = [member.video_id for member in group.members.all()]
        else:
            return None

        if not group_video_ids:
            return None

        vector_store = self._create_vector_store()
        return vector_store.as_retriever(
            search_kwargs={
                "k": 20,
                "filter": {
                    "user_id": self.user.id,
                    "video_id": {"$in": group_video_ids},
                },
            }
        )

    def _extract_page_contents(self, docs: Sequence[Any]) -> list[str]:
        return [getattr(doc, "page_content", "") for doc in docs if getattr(doc, "page_content", "")]

    def _build_reference_entries(self, docs: Sequence[Any]) -> list[str]:
        if not docs:
            return []
        reference_entries: list[str] = []
        for i, doc in enumerate(docs, start=1):
            metadata = getattr(doc, "metadata", {}) or {}
            title = metadata.get("video_title", "")
            start_time = metadata.get("start_time", "")
            end_time = metadata.get("end_time", "")
            page_content = getattr(doc, "page_content", "")
            reference_entries.append(
                f"[{i}] {title} {start_time} - {end_time}\n{page_content}"
            )
        return reference_entries

    def _extract_citations(self, docs: Sequence[Any]) -> list[dict[str, str]] | None:
        if not docs:
            return None
        citations: list[dict[str, str]] = []
        for doc in docs:
            metadata = getattr(doc, "metadata", {}) or {}
            citations.append(
                {
                    "video_id": metadata.get("video_id", ""),
                    "title": metadata.get("video_title", ""),
                    "start_time": metadata.get("start_time", ""),
                    "end_time": metadata.get("end_time", ""),
                }
            )
        return citations

    def _build_prompt_payload(self, data: dict[str, Any]) -> dict[str, Any]:
        docs_obj = data.get("docs") or []
        docs = cast(Sequence[Any], docs_obj)
        query_text = cast(str, data.get("query_text", ""))
        locale = cast(str | None, data.get("locale"))
        group_context = cast(str | None, data.get("group_context")) or None

        reference_entries = self._build_reference_entries(docs)
        system_prompt = build_system_prompt(
            locale=locale,
            references=reference_entries,
            group_context=group_context,
        )

        return {
            "prompt_input": {
                "system_prompt": system_prompt,
                "query_text": query_text,
            },
            "citations": self._extract_citations(docs),
        }

    def _create_vector_store(self) -> PGVectorStore:
        embeddings = get_embeddings()
        return PGVectorManager.create_vectorstore(embeddings)
