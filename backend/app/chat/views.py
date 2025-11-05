import csv
import json

from app.common.authentication import CookieJWTAuthentication
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.common.responses import create_error_response
from app.models import ChatLog, VideoGroup, VideoGroupMember
from django.db.models import Prefetch
from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ChatLogSerializer
from .services import (RagChatService, get_langchain_llm,
                       handle_langchain_exception)


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
        group = None

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
            if group_id is not None and not is_shared:
                try:
                    group = _get_video_group_with_members(group_id, user_id=user.id)
                except VideoGroup.DoesNotExist:
                    return create_error_response(
                        "指定のグループが見つかりません", status.HTTP_404_NOT_FOUND
                    )

            service = RagChatService(user=user, llm=llm)
            result = service.run(
                messages=messages,
                group=group if group_id is not None else None,
            )

            response_data = {
                "role": "assistant",
                "content": result.llm_response.content,
            }

            if group_id is not None and result.related_videos:
                response_data["related_videos"] = result.related_videos

            if group_id is not None and group is not None:
                ChatLog.objects.create(
                    user=(group.user if is_shared else user),
                    group=group,
                    question=result.query_text,
                    answer=result.llm_response.content,
                    related_videos=result.related_videos or [],
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
