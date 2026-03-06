"""
LangChain RAG service implementation.
Moved from app/chat/services/rag_chat.py.
"""

from dataclasses import dataclass
from operator import itemgetter
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence, cast

from django.conf import settings
from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda, RunnableParallel
from langchain_postgres import PGVectorStore

from app.infrastructure.external.prompts import build_system_prompt
from app.infrastructure.external.vector_store import PGVectorManager
from app.infrastructure.common.embeddings import get_embeddings

if TYPE_CHECKING:  # pragma: no cover
    from app.infrastructure.models import VideoGroup


@dataclass
class RagChatResult:
    """RAG execution result."""

    llm_response: AIMessage
    query_text: str
    related_videos: Optional[List[Dict[str, str]]]


class RagChatService:
    """Service class that handles RAG logic for chat."""

    def __init__(self, user, llm):
        self.user = user
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "{system_prompt}"),
                ("human", "{query_text}"),
            ]
        )

    def run(
        self,
        messages: Sequence[Dict[str, str]],
        group: Optional["VideoGroup"] = None,
        locale: Optional[str] = None,
        video_ids: Optional[List[int]] = None,
    ) -> RagChatResult:
        query_text = self._extract_latest_user_query(messages)
        # video_ids takes precedence over group (allows gateway to pass IDs directly)
        retriever = self._get_retriever(group, video_ids=video_ids)

        if retriever is not None:
            rag_chain = (
                RunnableParallel(
                    {
                        "query_text": itemgetter("query_text"),
                        "locale": itemgetter("locale"),
                        "docs": itemgetter("query_text") | retriever,
                    }
                )
                | RunnableLambda(self._build_prompt_payload)
                | RunnableParallel(
                    {
                        "llm_response": itemgetter("prompt_input")
                        | self.prompt
                        | self.llm,
                        "related_videos": itemgetter("related_videos"),
                    }
                )
            )
        else:
            rag_chain = RunnableLambda(self._build_prompt_payload) | RunnableParallel(
                {
                    "llm_response": itemgetter("prompt_input") | self.prompt | self.llm,
                    "related_videos": itemgetter("related_videos"),
                }
            )

        result = rag_chain.invoke({"query_text": query_text, "locale": locale})
        llm_response = cast(AIMessage, result.get("llm_response"))
        related_videos = result.get("related_videos")

        return RagChatResult(
            llm_response=llm_response,
            query_text=query_text,
            related_videos=related_videos,
        )

    def _extract_latest_user_query(self, messages: Sequence[Dict[str, str]]) -> str:
        for msg in reversed(messages):
            if msg.get("role") == "user" and msg.get("content"):
                return msg["content"]
        if messages:
            return messages[-1].get("content", "") or ""
        return ""

    def _get_retriever(
        self,
        group: Optional["VideoGroup"] = None,
        video_ids: Optional[List[int]] = None,
    ) -> Optional[Any]:
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
                "k": 6,
                "filter": {
                    "user_id": self.user.id,
                    "video_id": {"$in": group_video_ids},
                },
            }
        )

    def _build_reference_entries(self, docs: Sequence[Any]) -> List[str]:
        if not docs:
            return []
        reference_entries: List[str] = []
        for doc in docs:
            metadata = getattr(doc, "metadata", {}) or {}
            title = metadata.get("video_title", "")
            start_time = metadata.get("start_time", "")
            end_time = metadata.get("end_time", "")
            page_content = getattr(doc, "page_content", "")
            reference_entries.append(
                f"{title} {start_time} - {end_time}\n{page_content}"
            )
        return reference_entries

    def _extract_related_videos(
        self, docs: Sequence[Any]
    ) -> Optional[List[Dict[str, str]]]:
        if not docs:
            return None
        related_videos: List[Dict[str, str]] = []
        for doc in docs:
            metadata = getattr(doc, "metadata", {}) or {}
            related_videos.append(
                {
                    "video_id": metadata.get("video_id", ""),
                    "title": metadata.get("video_title", ""),
                    "start_time": metadata.get("start_time", ""),
                    "end_time": metadata.get("end_time", ""),
                }
            )
        return related_videos

    def _build_prompt_payload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        docs_obj = data.get("docs") or []
        docs = cast(Sequence[Any], docs_obj)
        query_text = cast(str, data.get("query_text", ""))
        locale = cast(Optional[str], data.get("locale"))

        reference_entries = self._build_reference_entries(docs)
        system_prompt = build_system_prompt(locale=locale, references=reference_entries)

        return {
            "prompt_input": {
                "system_prompt": system_prompt,
                "query_text": query_text,
            },
            "related_videos": self._extract_related_videos(docs),
        }

    def _create_vector_store(self) -> PGVectorStore:
        api_key = None
        if settings.EMBEDDING_PROVIDER == "openai":
            api_key = settings.OPENAI_API_KEY
        embeddings = get_embeddings(api_key)
        return PGVectorManager.create_vectorstore(embeddings)
