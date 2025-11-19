from dataclasses import dataclass
from operator import itemgetter
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence, cast

from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda, RunnableParallel
from langchain_openai import OpenAIEmbeddings
from langchain_postgres import PGVector

from app.chat.prompts import build_system_prompt
from app.utils.encryption import decrypt_api_key
from app.utils.vector_manager import PGVectorManager

if TYPE_CHECKING:  # pragma: no cover - Used only for type checking
    from app.models import VideoGroup


@dataclass
class RagChatResult:
    """RAG execution result"""

    llm_response: AIMessage
    query_text: str
    related_videos: Optional[List[Dict[str, str]]]


class RagChatService:
    """Service class that handles RAG logic for chat"""

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
    ) -> RagChatResult:
        query_text = self._extract_latest_user_query(messages)

        # Get retriever (only if group exists)
        retriever = self._get_retriever(group)

        # Build RAG chain following official pattern
        if retriever is not None:
            # RAG chain following official pattern
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
            # When retriever is not available (no group)
            rag_chain = RunnableLambda(self._build_prompt_payload) | RunnableParallel(
                {
                    "llm_response": itemgetter("prompt_input") | self.prompt | self.llm,
                    "related_videos": itemgetter("related_videos"),
                }
            )

        # Execute chain
        result = rag_chain.invoke({"query_text": query_text, "locale": locale})
        llm_response = result.get("llm_response")
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

    def _get_retriever(self, group: Optional["VideoGroup"]) -> Optional[Any]:
        """Get retriever from group"""
        if group is None:
            return None

        members = list(group.members.all())
        group_video_ids = [str(member.video_id) for member in members]

        if not group_video_ids:
            return None

        vector_store = self._create_vector_store()
        retriever = vector_store.as_retriever(
            search_kwargs={
                "k": 6,
                "filter": {
                    "user_id": self.user.id,
                    "video_id": {"$in": group_video_ids},
                },
            }
        )

        return retriever

    def _build_reference_entries(self, docs: Sequence[Any]) -> List[str]:
        """Generate reference information list for detailed prompt from documents"""
        if not docs:
            return []

        reference_entries: List[str] = []

        for idx, doc in enumerate(docs, start=1):
            metadata = getattr(doc, "metadata", {}) or {}
            title = metadata.get("video_title", "")
            start_time = metadata.get("start_time", "")
            end_time = metadata.get("end_time", "")
            page_content = getattr(doc, "page_content", "")

            reference_entries.append(
                f"[{idx}] {title} {start_time} - {end_time}\n{page_content}"
            )

        return reference_entries

    def _extract_related_videos(
        self, docs: Sequence[Any]
    ) -> Optional[List[Dict[str, str]]]:
        """Extract related videos from documents"""
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
        """Combine prompt input and related metadata"""
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

    def _create_vector_store(self) -> PGVector:
        api_key = decrypt_api_key(self.user.encrypted_openai_api_key)
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small", api_key=api_key)
        config = PGVectorManager.get_config()
        connection_str = PGVectorManager.get_psycopg_connection_string()

        return PGVector.from_existing_index(
            collection_name=config["collection_name"],
            embedding=embeddings,
            connection=connection_str,
            use_jsonb=True,
        )
