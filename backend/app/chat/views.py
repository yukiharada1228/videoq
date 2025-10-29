# RAG 用
from app.models import VideoGroup
from app.utils.encryption import decrypt_api_key
from app.utils.mixins import AuthenticatedViewMixin
from app.utils.responses import create_error_response
from app.utils.vector_manager import PGVectorManager
from langchain_community.vectorstores import PGVector
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import OpenAIEmbeddings
from rest_framework import generics, status
from rest_framework.response import Response

from .langchain_utils import get_langchain_llm, handle_langchain_exception


class ChatView(AuthenticatedViewMixin, generics.CreateAPIView):
    """チャットビュー（LangChain使用）"""

    def post(self, request):
        user = request.user

        # LangChainのLLMを取得
        llm, error_response = get_langchain_llm(user)
        if error_response:
            return error_response

        # メッセージを検証
        messages = request.data.get("messages", [])
        if not messages:
            return create_error_response(
                "メッセージが空です", status.HTTP_400_BAD_REQUEST
            )

        group_id = request.data.get("group_id")

        try:
            # LangChainのメッセージ形式に変換
            langchain_messages = []
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")

                if role == "system":
                    langchain_messages.append(SystemMessage(content=content))
                elif role == "user":
                    langchain_messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    langchain_messages.append(AIMessage(content=content))

            # グループRAG: group_id が指定されていれば関連動画でベクトル検索
            if group_id is not None:
                try:
                    group = (
                        VideoGroup.objects.select_related("user")
                        .prefetch_related("members")
                        .get(id=group_id, user_id=user.id)
                    )
                except VideoGroup.DoesNotExist:
                    return create_error_response(
                        "指定のグループが見つかりません", status.HTTP_404_NOT_FOUND
                    )

                # 直近のユーザ質問を抽出
                query_text = None
                for m in reversed(messages):
                    if m.get("role") == "user":
                        query_text = m.get("content", "")
                        break
                if not query_text:
                    query_text = messages[-1].get("content", "")

                # ベクトルストアへ接続
                api_key = decrypt_api_key(user.encrypted_openai_api_key)
                embeddings = OpenAIEmbeddings(
                    model="text-embedding-3-small", api_key=api_key
                )
                config = PGVectorManager.get_config()
                vector_store = PGVector.from_existing_index(
                    collection_name=config["collection_name"],
                    embedding=embeddings,
                    connection_string=config["database_url"],
                )

                # グループ内の video_id をクエリ時にフィルタ
                group_video_ids = list(group.members.values_list("video_id", flat=True))

                docs = vector_store.similarity_search(
                    query_text,
                    k=6,
                    filter={
                        "user_id": user.id,  # メタデータ型に合わせ数値で渡す
                        "video_id": {"$in": group_video_ids},
                    },
                )

                if docs:
                    # コンテキストを SystemMessage として付与
                    context_lines = []
                    context_lines.append(
                        "以下はあなたの動画グループから抽出した関連シーンです。回答は必ずこの文脈を最優先してください。"
                    )
                    for idx, d in enumerate(docs, 1):
                        title = d.metadata.get("video_title", "")
                        st = d.metadata.get("start_time", "")
                        et = d.metadata.get("end_time", "")
                        context_lines.append(
                            f"[{idx}] {title} {st} - {et}\n{d.page_content}"
                        )
                    context_lines.append(
                        "不明な場合は推測せず、その旨を伝えてください。"
                    )
                    system_ctx = SystemMessage(content="\n\n".join(context_lines))
                    langchain_messages = [system_ctx] + langchain_messages

            # LangChainでチャット補完を実行（RAGの有無に関わらず）
            response = llm.invoke(langchain_messages)

            return Response(
                {
                    "role": "assistant",
                    "content": response.content,
                }
            )

        except Exception as e:
            return handle_langchain_exception(e)
