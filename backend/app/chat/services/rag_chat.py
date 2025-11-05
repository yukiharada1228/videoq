from dataclasses import dataclass
from typing import TYPE_CHECKING, Dict, List, Optional, Sequence

from app.utils.encryption import decrypt_api_key
from app.utils.vector_manager import PGVectorManager
from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langchain_openai import OpenAIEmbeddings
from langchain_postgres import PGVector

if TYPE_CHECKING:  # pragma: no cover - 型チェック用のみに使用
    from app.models import VideoGroup


@dataclass
class RagChatResult:
    """RAG実行結果"""

    llm_response: AIMessage
    query_text: str
    related_videos: Optional[List[Dict[str, str]]]


DEFAULT_SYSTEM_CONTEXT = (
    "あなたは動画グループに紐づくシーンの内容をもとに回答するアシスタントです。"
    "不明な点があれば無理に補完せず、わからない旨を200文字以内で伝えてください。"
)


class RagChatService:
    """チャット用RAGロジックを担うサービスクラス"""

    def __init__(self, user, llm):
        self.user = user
        self.llm = llm
        self.prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "{system_context}"),
                ("human", "{query_text}"),
            ]
        )

    def run(
        self,
        messages: Sequence[Dict[str, str]],
        group: Optional["VideoGroup"] = None,
    ) -> RagChatResult:
        query_text = self._extract_latest_user_query(messages)

        payload = {
            "query_text": query_text,
            "group": group,
        }

        context_chain = (
            RunnableLambda(self._attach_group_retriever)
            | RunnableLambda(self._run_similarity_search)
            | RunnableLambda(self._build_system_context)
        )

        context_bundle = context_chain.invoke(payload)

        system_context = context_bundle.get("system_context") or DEFAULT_SYSTEM_CONTEXT
        related_videos = context_bundle.get("related_videos")

        formatted_messages = self.prompt.format_messages(
            system_context=system_context,
            query_text=query_text,
        )

        llm_response = self.llm.invoke(formatted_messages)

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

    def _attach_group_retriever(self, payload: Dict[str, object]) -> Dict[str, object]:
        group = payload.get("group")
        if group is None:
            return {**payload, "retriever": None}

        members = list(group.members.all())
        group_video_ids = [str(member.video_id) for member in members]

        if not group_video_ids:
            return {**payload, "retriever": None}

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

        return {**payload, "retriever": retriever}

    def _run_similarity_search(self, payload: Dict[str, object]) -> Dict[str, object]:
        retriever = payload.get("retriever")
        query_text = payload.get("query_text", "")

        if retriever is None or not query_text:
            return {**payload, "docs": []}

        docs = retriever.invoke(query_text)
        return {**payload, "docs": docs}

    def _build_system_context(
        self, payload: Dict[str, object]
    ) -> Dict[str, Optional[object]]:
        docs = payload.get("docs") or []

        if not docs:
            return {"system_context": None, "related_videos": None}

        context_lines: List[str] = [
            "以下はあなたの動画グループから抽出した関連シーンです。回答は必ずこの文脈を最優先してください。"
        ]
        related_videos: List[Dict[str, str]] = []

        for idx, doc in enumerate(docs, start=1):
            metadata = getattr(doc, "metadata", {}) or {}
            title = metadata.get("video_title", "")
            start_time = metadata.get("start_time", "")
            end_time = metadata.get("end_time", "")
            video_id = metadata.get("video_id", "")

            context_lines.append(
                f"[{idx}] {title} {start_time} - {end_time}\n{doc.page_content}"
            )
            related_videos.append(
                {
                    "video_id": video_id,
                    "title": title,
                    "start_time": start_time,
                    "end_time": end_time,
                }
            )

        context_lines.append(
            "不明な場合は推測せず、その旨を200文字以内で伝えてください。"
        )

        return {
            "system_context": "\n\n".join(context_lines),
            "related_videos": related_videos,
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
