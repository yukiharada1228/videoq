from dataclasses import dataclass
from operator import itemgetter
from typing import TYPE_CHECKING, Dict, List, Optional, Sequence

from app.utils.encryption import decrypt_api_key
from app.utils.vector_manager import PGVectorManager
from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda, RunnableParallel
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

        # リトリーバーの取得（グループがある場合のみ）
        retriever = self._get_retriever(group)

        # 公式パターンに沿ったRAGチェーンの構築
        if retriever is not None:
            # 公式パターンに沿ったRAGチェーン
            rag_chain = (
                RunnableParallel(
                    {
                        "query_text": itemgetter("query_text"),
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
            # リトリーバーがない場合（グループがない場合）
            rag_chain = RunnableLambda(self._build_prompt_payload) | RunnableParallel(
                {
                    "llm_response": itemgetter("prompt_input") | self.prompt | self.llm,
                    "related_videos": itemgetter("related_videos"),
                }
            )

        # チェーンを実行
        result = rag_chain.invoke({"query_text": query_text})
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

    def _get_retriever(self, group: Optional["VideoGroup"]) -> Optional:
        """グループからリトリーバーを取得する（公式パターン）"""
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

    def _build_system_context(self, docs: List) -> Dict[str, Optional[str]]:
        """ドキュメントからシステムコンテキストを構築（公式パターンに沿った実装）"""
        if not docs:
            return {
                "system_context": None,
            }

        context_lines: List[str] = [
            "以下はあなたの動画グループから抽出した関連シーンです。回答は必ずこの文脈を最優先してください。"
        ]

        for idx, doc in enumerate(docs, start=1):
            metadata = getattr(doc, "metadata", {}) or {}
            title = metadata.get("video_title", "")
            start_time = metadata.get("start_time", "")
            end_time = metadata.get("end_time", "")

            context_lines.append(
                f"[{idx}] {title} {start_time} - {end_time}\n{doc.page_content}"
            )

        context_lines.append(
            "不明な場合は推測せず、その旨を200文字以内で伝えてください。"
        )

        return {
            "system_context": "\n\n".join(context_lines),
        }

    def _extract_related_videos(self, docs: List) -> Optional[List[Dict[str, str]]]:
        """ドキュメントから関連動画を抽出"""
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

    def _build_prompt_payload(self, data: Dict[str, object]) -> Dict[str, object]:
        """プロンプト入力と関連メタデータをまとめる"""
        docs = data.get("docs") or []
        query_text = data.get("query_text", "")

        system_context = self._build_system_context(docs).get("system_context")
        if system_context is None:
            system_context = DEFAULT_SYSTEM_CONTEXT

        return {
            "prompt_input": {
                "system_context": system_context,
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
