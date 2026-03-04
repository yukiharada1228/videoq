"""
Presentation layer views for the chat domain.
Views are thin HTTP adapters that delegate to use cases.
"""

import csv

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.common.permissions import IsAuthenticatedOrSharedAccess, ShareTokenAuthentication
from app.common.responses import create_error_response
from app.common.throttles import (
    AuthenticatedChatThrottle,
    ShareTokenGlobalThrottle,
    ShareTokenIPThrottle,
)
from app.infrastructure.repositories.django_chat_repository import (
    DjangoChatRepository,
    DjangoVideoGroupQueryRepository,
)
from app.use_cases.chat.export_history import ExportChatHistoryUseCase
from app.use_cases.chat.get_analytics import GetChatAnalyticsUseCase
from app.use_cases.chat.get_history import GetChatHistoryUseCase
from app.use_cases.chat.get_popular_scenes import GetPopularScenesUseCase
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.chat.submit_feedback import SubmitFeedbackUseCase
from app.use_cases.video.exceptions import ResourceNotFound
from django.http import HttpResponse

from .serializers import (
    ChatAnalyticsResponseSerializer,
    ChatFeedbackRequestSerializer,
    ChatFeedbackResponseSerializer,
    ChatLogSerializer,
    ChatRequestSerializer,
    ChatResponseSerializer,
)


def _get_locale(request) -> str | None:
    accept_language = request.headers.get("Accept-Language", "")
    if accept_language:
        return accept_language.split(",")[0].split(";")[0].strip() or None
    return None


def _make_repos():
    return DjangoChatRepository(), DjangoVideoGroupQueryRepository()


class ChatView(generics.CreateAPIView):
    """Chat endpoint with optional RAG context via video groups."""

    serializer_class = ChatRequestSerializer
    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess]
    throttle_classes = [
        ShareTokenIPThrottle,
        ShareTokenGlobalThrottle,
        AuthenticatedChatThrottle,
    ]

    @extend_schema(
        request=ChatRequestSerializer,
        responses={200: ChatResponseSerializer},
        summary="Send chat message",
        description="Send a chat message and get AI response. Supports RAG when group_id is provided.",
    )
    def post(self, request):
        from app.infrastructure.external.llm import get_langchain_llm, handle_langchain_exception

        share_token = request.query_params.get("share_token")
        is_shared = share_token is not None

        # Resolve user and group for shared-access flow
        group = None
        user = request.user
        group_id = request.data.get("group_id")

        if is_shared:
            if not group_id:
                return create_error_response(
                    "Group ID not specified", status.HTTP_400_BAD_REQUEST
                )
            group_query_repo = DjangoVideoGroupQueryRepository()
            group = group_query_repo.get_with_members(
                group_id=group_id, share_token=share_token
            )
            if group is None:
                return create_error_response(
                    "Shared group not found", status.HTTP_404_NOT_FOUND
                )
            user = group.user

        messages = request.data.get("messages", [])
        if not messages:
            return create_error_response("Messages are empty", status.HTTP_400_BAD_REQUEST)

        llm, error_response = get_langchain_llm(user)
        if error_response:
            return error_response

        chat_repo, group_query_repo = _make_repos()
        use_case = SendMessageUseCase(chat_repo, group_query_repo)

        try:
            result = use_case.execute(
                user=user,
                llm=llm,
                messages=messages,
                group_id=group_id,
                group=group,
                is_shared=is_shared,
                locale=_get_locale(request),
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return handle_langchain_exception(e)

        response_data = {"role": "assistant", "content": result.content}
        if group_id is not None and result.related_videos:
            response_data["related_videos"] = result.related_videos
        if result.chat_log_id is not None:
            response_data["chat_log_id"] = result.chat_log_id
            response_data["feedback"] = result.feedback

        return Response(response_data)


class ChatFeedbackView(APIView):
    """Submit feedback for a chat log entry."""

    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    @extend_schema(
        request=ChatFeedbackRequestSerializer,
        responses={200: ChatFeedbackResponseSerializer},
        summary="Submit chat feedback",
        description="Submit feedback (good/bad) for a chat log.",
    )
    def post(self, request):
        share_token = request.query_params.get("share_token")
        chat_log_id = request.data.get("chat_log_id")
        feedback = request.data.get("feedback")

        if chat_log_id is None:
            return create_error_response(
                "chat_log_id not specified", status.HTTP_400_BAD_REQUEST
            )
        if feedback == "":
            feedback = None

        from app.models import ChatLog

        valid_feedback = {None, ChatLog.FeedbackChoices.GOOD, ChatLog.FeedbackChoices.BAD}
        if feedback not in valid_feedback:
            return create_error_response(
                "feedback must be 'good', 'bad', or null (unspecified)",
                status.HTTP_400_BAD_REQUEST,
            )

        chat_repo = DjangoChatRepository()
        use_case = SubmitFeedbackUseCase(chat_repo)
        try:
            log = use_case.execute(
                chat_log_id=chat_log_id,
                feedback=feedback,
                user_id=getattr(request.user, "id", None),
                share_token=share_token,
            )
        except ValueError as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except PermissionError as e:
            return create_error_response(str(e), status.HTTP_403_FORBIDDEN)

        return Response({"chat_log_id": log.id, "feedback": log.feedback})


class ChatHistoryView(generics.ListAPIView):
    """Get conversation history for a group (owner only)."""

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = ChatLogSerializer

    def get_queryset(self):
        group_id = self.request.query_params.get("group_id")
        if not group_id:
            from app.models import ChatLog

            return ChatLog.objects.none()

        chat_repo, group_query_repo = _make_repos()
        use_case = GetChatHistoryUseCase(chat_repo, group_query_repo)
        return use_case.execute(
            group_id=int(group_id),
            user_id=self.request.user.id,
            ascending=False,
        )


class ChatHistoryExportView(APIView):
    """Export group conversation history as CSV."""

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="CSV export of chat history.",
            )
        },
        summary="Export chat history CSV",
        description="Export group conversation history as a CSV file.",
    )
    def get(self, request):
        group_id = request.query_params.get("group_id")
        if not group_id:
            return create_error_response(
                "Group ID not specified", status.HTTP_400_BAD_REQUEST
            )

        chat_repo, group_query_repo = _make_repos()
        use_case = ExportChatHistoryUseCase(chat_repo, group_query_repo)
        try:
            resolved_group_id, rows = use_case.execute(
                group_id=int(group_id), user_id=request.user.id
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="chat_history_group_{resolved_group_id}.csv"'
        )
        writer = csv.writer(response)
        writer.writerow(
            ["created_at", "question", "answer", "is_shared_origin", "related_videos", "feedback"]
        )
        for row in rows:
            writer.writerow(row)
        return response


class PopularScenesView(APIView):
    """Get popular scenes referenced across a group's chat history."""

    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    @extend_schema(
        parameters=[
            OpenApiParameter("group_id", int, required=True),
            OpenApiParameter("limit", int, required=False),
            OpenApiParameter("share_token", str, required=False),
        ],
        responses={
            200: {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "video_id": {"type": "integer"},
                        "title": {"type": "string"},
                        "start_time": {"type": "string"},
                        "end_time": {"type": "string"},
                        "reference_count": {"type": "integer"},
                        "file": {"type": "string", "nullable": True},
                        "questions": {"type": "array", "items": {"type": "string"}},
                    },
                },
            }
        },
        summary="Get popular scenes",
        description="Returns frequently referenced scenes from chat logs for a video group.",
    )
    def get(self, request):
        group_id = request.query_params.get("group_id")
        share_token = request.query_params.get("share_token")
        try:
            limit = max(1, min(int(request.query_params.get("limit", 20)), 100))
        except (ValueError, TypeError):
            return create_error_response("Invalid limit parameter", status.HTTP_400_BAD_REQUEST)

        if not group_id:
            return create_error_response("Group ID not specified", status.HTTP_400_BAD_REQUEST)

        chat_repo, group_query_repo = _make_repos()
        use_case = GetPopularScenesUseCase(chat_repo, group_query_repo)
        try:
            result = use_case.execute(
                group_id=int(group_id),
                limit=limit,
                user_id=getattr(request.user, "id", None),
                share_token=share_token,
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

        return Response(result)


class ChatAnalyticsView(APIView):
    """Analytics dashboard data for a chat group."""

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: ChatAnalyticsResponseSerializer},
        summary="Get chat analytics",
        description="Return analytics dashboard data for a chat group.",
    )
    def get(self, request):
        group_id = request.query_params.get("group_id")
        if not group_id:
            return create_error_response("Group ID not specified", status.HTTP_400_BAD_REQUEST)

        chat_repo, group_query_repo = _make_repos()
        use_case = GetChatAnalyticsUseCase(chat_repo, group_query_repo)
        try:
            data = use_case.execute(group_id=int(group_id), user_id=request.user.id)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

        return Response(data)
