from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence, cast

from app.chat.prompts import build_system_prompt
from app.utils.encryption import decrypt_api_key
from app.utils.vector_manager import PGVectorManager
from langchain_core.messages import AIMessage
from langchain_core.prompts import ChatPromptTemplate
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


class RagChatService:
    """チャット用RAGロジックを担うサービスクラス"""

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
        """
        RAGチャットを実行し、結果を返す。
        VideoGroupが指定されている場合はRAGを使用し、そうでない場合は通常のチャットを実行する。
        """
        query_text = self._extract_latest_user_query(messages)
        retriever = self._get_retriever(group)

        if retriever:
            return self._run_rag_chat(query_text, locale, retriever)
        else:
            return self._run_simple_chat(query_text, locale)

    def _run_rag_chat(
        self, query_text: str, locale: Optional[str], retriever: Any
    ) -> RagChatResult:
        """RAGを使用してチャットを実行する"""
        # 1. 元のクエリでドキュメントを検索
        docs = retriever.get_relevant_documents(query_text)
        reversed_docs = docs[::-1]

        # 2. 検索結果を元にLLMの応答を生成
        system_prompt = build_system_prompt(
            locale=locale,
            references=self._build_reference_entries(reversed_docs),
        )
        prompt_input = {"system_prompt": system_prompt, "query_text": query_text}
        llm_response = (self.prompt | self.llm).invoke(prompt_input)

        # 3. LLMの応答を元に関連動画を再検索
        related_videos = self._research_related_videos(llm_response, docs, retriever)

        return RagChatResult(
            llm_response=llm_response,
            query_text=query_text,
            related_videos=related_videos,
        )

    def _run_simple_chat(self, query_text: str, locale: Optional[str]) -> RagChatResult:
        """RAGを使用せずに単純なチャットを実行する"""
        system_prompt = build_system_prompt(locale=locale, references=[])
        prompt_input = {"system_prompt": system_prompt, "query_text": query_text}
        llm_response = (self.prompt | self.llm).invoke(prompt_input)
        return RagChatResult(
            llm_response=llm_response, query_text=query_text, related_videos=None
        )

    def _extract_latest_user_query(self, messages: Sequence[Dict[str, str]]) -> str:
        for msg in reversed(messages):
            if msg.get("role") == "user" and msg.get("content"):
                return msg["content"]

        if messages:
            return messages[-1].get("content", "") or ""

        return ""

    def _get_retriever(self, group: Optional["VideoGroup"]) -> Optional[Any]:
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

    def _build_reference_entries(self, docs: Sequence[Any]) -> List[str]:
        """ドキュメントから詳細プロンプト用の参考情報リストを生成"""
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

    def _research_related_videos(
        self, llm_response: AIMessage, docs: Sequence[Any], retriever: Any
    ) -> Optional[List[Dict[str, str]]]:
        """LLMの回答を元に関連動画を再検索する"""
        llm_response_text = cast(str, llm_response.content)

        # LLMの回答があればそれで再検索、なければ元の検索結果を使う
        search_docs = docs
        if llm_response_text:
            search_docs = retriever.get_relevant_documents(llm_response_text)

        return self._extract_related_videos(search_docs)

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
