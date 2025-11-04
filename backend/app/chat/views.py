import csv
import json

from app.authentication import CookieJWTAuthentication
from app.models import ChatLog, VideoGroup, VideoGroupMember
from app.utils.encryption import decrypt_api_key
from app.utils.responses import create_error_response
from app.utils.vector_manager import PGVectorManager
from app.views import IsAuthenticatedOrSharedAccess, ShareTokenAuthentication
from django.db.models import Prefetch
from django.http import HttpResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import OpenAIEmbeddings
from langchain_postgres import PGVector
from rest_framework import generics, status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .langchain_utils import get_langchain_llm, handle_langchain_exception
from .serializers import ChatLogSerializer


def _get_chat_logs_queryset(group, ascending=True):
    """
    チャットログクエリセットを取得

    Args:
        group: VideoGroupインスタンス
        ascending: 昇順かどうか（True: 昇順、False: 降順）

    Returns:
        QuerySet: チャットログのクエリセット
    """
    order_field = "created_at" if ascending else "-created_at"
    return group.chat_logs.select_related("user").order_by(order_field)


def _create_vector_store(user):
    """
    ベクトルストアを作成

    Args:
        user: ユーザーオブジェクト

    Returns:
        PGVector: ベクトルストアインスタンス
    """
    api_key = decrypt_api_key(user.encrypted_openai_api_key)
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small", api_key=api_key)
    config = PGVectorManager.get_config()

    connection_str = PGVectorManager.get_psycopg_connection_string()

    return PGVector.from_existing_index(
        collection_name=config["collection_name"],
        embedding=embeddings,
        connection=connection_str,  # langchain_postgresではconnectionパラメータを使用（psycopg3形式）
        use_jsonb=True,  # JSONBフィルタリングを有効化（$in演算子を使用するために必要）
    )


def _get_video_group_with_members(group_id, user_id=None, share_token=None):
    """
    グループとメンバー情報を取得

    Args:
        group_id: グループID
        user_id: ユーザーID（オプション）
        share_token: 共有トークン（オプション）

    Returns:
        VideoGroup: グループオブジェクト
    """
    queryset = VideoGroup.objects.select_related("user").prefetch_related(
        Prefetch(
            "members",
            queryset=VideoGroupMember.objects.select_related("video"),
        )
    )

    if share_token:
        return queryset.get(id=group_id, share_token=share_token)
    elif user_id:
        return queryset.get(id=group_id, user_id=user_id)
    else:
        return queryset.get(id=group_id)


class ChatView(generics.CreateAPIView):
    """チャットビュー（LangChain使用・共有トークン対応）"""

    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    def post(self, request):
        # 共有トークン認証の場合
        share_token = request.query_params.get("share_token")
        is_shared = share_token is not None

        if is_shared:
            # 共有トークンでグループを取得
            group_id = request.data.get("group_id")
            if not group_id:
                return create_error_response(
                    "グループIDが指定されていません", status.HTTP_400_BAD_REQUEST
                )

            try:
                group = _get_video_group_with_members(group_id, share_token=share_token)
                user = group.user  # グループオーナーのユーザー
            except VideoGroup.DoesNotExist:
                return create_error_response(
                    "共有グループが見つかりません", status.HTTP_404_NOT_FOUND
                )
        else:
            # 通常の認証済みユーザー
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
                # 共有トークンの場合は既にグループを取得済み
                if not is_shared:
                    try:
                        group = _get_video_group_with_members(group_id, user_id=user.id)
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
                vector_store = _create_vector_store(user)

                # グループ内の video_id をクエリ時にフィルタ（N+1問題対策: prefetch済みデータを使用）
                # list()で評価を確定してN+1問題を完全に回避
                members = list(group.members.all())
                group_video_ids = [member.video_id for member in members]

                # グループに動画が追加されている場合のみRAGを実行
                if group_video_ids:
                    # cmetadata->>'video_id'は文字列として取得されるため、文字列に変換
                    # (削除クエリでも str(video_id) を使用しているため)
                    group_video_ids_str = [str(vid) for vid in group_video_ids]

                    docs = vector_store.similarity_search(
                        query_text,
                        k=6,
                        filter={
                            "user_id": user.id,
                            "video_id": {
                                "$in": group_video_ids_str
                            },  # 文字列リストに変換（JSONBから文字列として取得されるため）
                        },
                    )
                else:
                    # グループに動画が追加されていない場合はRAGをスキップ
                    docs = []

                if docs:
                    # コンテキストを SystemMessage として付与
                    context_lines = []
                    context_lines.append(
                        "以下はあなたの動画グループから抽出した関連シーンです。回答は必ずこの文脈を最優先してください。"
                    )

                    # 関連動画の情報を保存
                    related_videos = []
                    for idx, d in enumerate(docs, 1):
                        metadata = d.metadata
                        title = metadata.get("video_title", "")
                        st = metadata.get("start_time", "")
                        et = metadata.get("end_time", "")
                        video_id = metadata.get("video_id", "")
                        context_lines.append(
                            f"[{idx}] {title} {st} - {et}\n{d.page_content}"
                        )
                        related_videos.append(
                            {
                                "video_id": video_id,
                                "title": title,
                                "start_time": st,
                                "end_time": et,
                            }
                        )
                    context_lines.append(
                        "不明な場合は推測せず、その旨を200文字以内で伝えてください。"
                    )
                    system_ctx = SystemMessage(content="\n\n".join(context_lines))
                    langchain_messages = [system_ctx] + langchain_messages

            # LangChainでチャット補完を実行（RAGの有無に関わらず）
            response = llm.invoke(langchain_messages)

            response_data = {
                "role": "assistant",
                "content": response.content,
            }

            # RAGが実行された場合は関連動画の情報も含める
            if group_id is not None and "related_videos" in locals():
                response_data["related_videos"] = related_videos

            # 会話ログ保存（グループ文脈時のみ）
            if group_id is not None:
                # 直近のユーザー質問は上で抽出済み（query_text）
                ChatLog.objects.create(
                    user=(group.user if is_shared else user),
                    group=group,
                    question=query_text,
                    answer=response.content,
                    related_videos=locals().get("related_videos", []),
                    is_shared_origin=is_shared,
                )

            return Response(response_data)

        except Exception as e:
            return handle_langchain_exception(e)


class ChatHistoryView(generics.ListAPIView):
    """
    グループの会話履歴を所有者のみが取得可能。
    GET /api/chat/history/?group_id=123
    """

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = ChatLogSerializer

    def get_queryset(self):
        group_id = self.request.query_params.get("group_id")
        if not group_id:
            return ChatLog.objects.none()

        try:
            group = _get_video_group_with_members(
                group_id, user_id=self.request.user.id
            )
        except VideoGroup.DoesNotExist:
            return ChatLog.objects.none()

        return _get_chat_logs_queryset(group, ascending=False)


class ChatHistoryExportView(APIView):
    """
    グループの会話履歴をCSVでエクスポート。
    所有者のみ許可。
    GET /api/chat/history/export/?group_id=123
    """

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        group_id = request.query_params.get("group_id")
        if not group_id:
            return create_error_response(
                "グループIDが指定されていません", status.HTTP_400_BAD_REQUEST
            )

        try:
            group = _get_video_group_with_members(group_id, user_id=request.user.id)
        except VideoGroup.DoesNotExist:
            return create_error_response(
                "指定のグループが見つかりません", status.HTTP_404_NOT_FOUND
            )

        queryset = _get_chat_logs_queryset(group, ascending=True)

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        filename = f"chat_history_group_{group.id}.csv"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)
        # ヘッダー
        writer.writerow(
            [
                "created_at",
                "question",
                "answer",
                "is_shared_origin",
                "related_videos",
            ]
        )

        for log in queryset:
            # related_videos はJSON文字列として格納
            try:
                related_videos_str = json.dumps(log.related_videos, ensure_ascii=False)
            except Exception:
                related_videos_str = "[]"

            writer.writerow(
                [
                    log.created_at.isoformat(),
                    log.question,
                    log.answer,
                    "true" if log.is_shared_origin else "false",
                    related_videos_str,
                ]
            )

        return response
