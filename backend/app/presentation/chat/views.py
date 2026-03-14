"""
Presentation layer views for the chat domain.
Views are thin HTTP adapters that delegate to use cases.
"""

import csv

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.presentation.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.use_cases.chat.dto import ChatMessageInput
from app.presentation.common.mixins import DependencyResolverMixin
from app.presentation.common.permissions import (
    ApiKeyScopePermission,
    IsAuthenticatedOrSharedAccess,
    ShareTokenAuthentication,
)
from app.presentation.common.responses import create_error_response
from app.presentation.common.throttles import (
    AuthenticatedChatThrottle,
    ShareTokenGlobalThrottle,
    ShareTokenIPThrottle,
)
from app.use_cases.chat.exceptions import (
    ChatNotFoundError,
    FeedbackPermissionDenied,
    InvalidChatRequestError,
    InvalidFeedbackError,
    LLMConfigurationError,
    LLMProviderError,
)
from app.use_cases.shared.exceptions import PermissionDenied, ResourceNotFound
from django.http import HttpResponse

from .exporters import write_chat_history_csv
from .serializers import (
    ChatAnalyticsResponseSerializer,
    ChatFeedbackRequestSerializer,
    ChatFeedbackResponseSerializer,
    ChatLogSerializer,
    ChatRequestSerializer,
    ChatResponseSerializer,
    ChatSearchRequestSerializer,
    ChatSearchResponseSerializer,
)


def _get_locale(request) -> str | None:
    accept_language = request.headers.get("Accept-Language", "")
    if accept_language:
        return accept_language.split(",")[0].split(";")[0].strip() or None
    return None


class ChatView(DependencyResolverMixin, APIView):
    """Chat endpoint with optional RAG context via video groups."""

    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess, ApiKeyScopePermission]
    required_scope = "chat_write"
    throttle_classes = [
        ShareTokenIPThrottle,
        ShareTokenGlobalThrottle,
        AuthenticatedChatThrottle,
    ]
    send_message_use_case = None

    @extend_schema(
        request=ChatRequestSerializer,
        responses={200: ChatResponseSerializer},
        summary="Send chat message",
        description="Send a chat message and get AI response. Supports RAG when group_id is provided.",
    )
    def post(self, request):
        share_token = request.query_params.get("share_token")
        is_shared = share_token is not None

        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        group_id = serializer.validated_data.get("group_id")

        user_id = getattr(request.user, "id", None)

        validated_messages = serializer.validated_data.get("messages", [])
        message_dtos = [
            ChatMessageInput(role=m["role"], content=m["content"])
            for m in validated_messages
        ]

        use_case = self.resolve_dependency(self.send_message_use_case)
        try:
            result = use_case.execute(
                user_id=user_id,
                messages=message_dtos,
                group_id=group_id,
                share_token=share_token,
                is_shared=is_shared,
                locale=_get_locale(request),
            )
        except InvalidChatRequestError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except PermissionDenied as e:
            return create_error_response(str(e), status.HTTP_403_FORBIDDEN)
        except LLMConfigurationError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except LLMProviderError as e:
            return create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)

        response_data = {"role": "assistant", "content": result.content}
        if group_id is not None and result.related_videos:
            response_data["related_videos"] = [
                {
                    "video_id": v.video_id,
                    "title": v.title,
                    "start_time": v.start_time,
                    "end_time": v.end_time,
                }
                for v in result.related_videos
            ]
        if result.chat_log_id is not None:
            response_data["chat_log_id"] = result.chat_log_id
            response_data["feedback"] = result.feedback

        return Response(response_data)


class ChatSearchView(DependencyResolverMixin, APIView):
    """Retrieval-only endpoint for related video scenes."""

    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess, ApiKeyScopePermission]
    required_scope = "read"
    throttle_classes = [
        ShareTokenIPThrottle,
        ShareTokenGlobalThrottle,
        AuthenticatedChatThrottle,
    ]
    search_related_videos_use_case = None

    @extend_schema(
        parameters=[
            OpenApiParameter("query_text", str, required=True),
            OpenApiParameter("group_id", int, required=True),
            OpenApiParameter("share_token", str, required=False),
        ],
        responses={200: ChatSearchResponseSerializer},
        summary="Search related scenes",
        description=(
            "Run retrieval-only search for related scenes within a group. "
            "No LLM answer generation is performed."
        ),
    )
    def get(self, request):
        share_token = request.query_params.get("share_token")
        is_shared = share_token is not None

        serializer = ChatSearchRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        use_case = self.resolve_dependency(self.search_related_videos_use_case)
        try:
            result = use_case.execute(
                user_id=getattr(request.user, "id", None),
                query_text=serializer.validated_data["query_text"],
                group_id=serializer.validated_data["group_id"],
                share_token=share_token,
                is_shared=is_shared,
            )
        except InvalidChatRequestError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except PermissionDenied as e:
            return create_error_response(str(e), status.HTTP_403_FORBIDDEN)
        except LLMProviderError as e:
            return create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)

        response_data = {"query_text": result.query_text}
        if result.related_videos:
            response_data["related_videos"] = [
                {
                    "video_id": v.video_id,
                    "title": v.title,
                    "start_time": v.start_time,
                    "end_time": v.end_time,
                }
                for v in result.related_videos
            ]

        return Response(response_data)


class ChatFeedbackView(DependencyResolverMixin, APIView):
    """Submit feedback for a chat log entry."""

    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess, ApiKeyScopePermission]
    required_scope = "chat_write"
    submit_feedback_use_case = None

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

        use_case = self.resolve_dependency(self.submit_feedback_use_case)
        try:
            log = use_case.execute(
                chat_log_id=chat_log_id,
                feedback=feedback,
                user_id=getattr(request.user, "id", None),
                share_token=share_token,
            )
        except InvalidFeedbackError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except ChatNotFoundError as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except FeedbackPermissionDenied as e:
            return create_error_response(str(e), status.HTTP_403_FORBIDDEN)

        return Response({"chat_log_id": log.id, "feedback": log.feedback})


class ChatHistoryView(DependencyResolverMixin, APIView):
    """Get conversation history for a group (owner only).

    Pass ?download=csv to download history as a CSV file.
    """

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    serializer_class = ChatLogSerializer
    chat_history_use_case = None
    export_history_use_case = None

    @extend_schema(
        parameters=[
            OpenApiParameter("group_id", int, required=False),
            OpenApiParameter("download", str, required=False, description="Pass 'csv' to download as a CSV file."),
        ],
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="CSV file when download=csv, otherwise JSON chat log list.",
            )
        },
        summary="Get chat history",
        description=(
            "Return chat history for a group. "
            "Pass ?download=csv to download as a CSV file. "
            "Empty list is returned when group_id is omitted."
        ),
    )
    def get(self, request, *args, **kwargs):
        group_id = request.query_params.get("group_id")

        if request.query_params.get("download") == "csv":
            if not group_id:
                return create_error_response(
                    "Group ID not specified", status.HTTP_400_BAD_REQUEST
                )
            use_case = self.resolve_dependency(self.export_history_use_case)
            try:
                resolved_group_id, rows = use_case.execute(
                    group_id=int(group_id), user_id=request.user.id
                )
            except ResourceNotFound as e:
                return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

            http_response = HttpResponse(content_type="text/csv; charset=utf-8")
            http_response["Content-Disposition"] = (
                f'attachment; filename="chat_history_group_{resolved_group_id}.csv"'
            )
            write_chat_history_csv(csv.writer(http_response), rows)
            return http_response

        if not group_id:
            return Response([])

        use_case = self.resolve_dependency(self.chat_history_use_case)
        try:
            logs = use_case.execute(
                group_id=int(group_id),
                user_id=request.user.id,
                ascending=False,
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        return Response(ChatLogSerializer(logs, many=True).data)


class PopularScenesView(DependencyResolverMixin, APIView):
    """Get popular scenes referenced across a group's chat history."""

    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess, ApiKeyScopePermission]
    popular_scenes_use_case = None

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

        use_case = self.resolve_dependency(self.popular_scenes_use_case)
        try:
            scenes = use_case.execute(
                group_id=int(group_id),
                limit=limit,
                user_id=getattr(request.user, "id", None),
                share_token=share_token,
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

        return Response([
            {
                "video_id": dto.video_id,
                "title": dto.title,
                "start_time": dto.start_time,
                "end_time": dto.end_time,
                "reference_count": dto.reference_count,
                "file": dto.file_url,
                "questions": dto.questions,
            }
            for dto in scenes
        ])


class ChatAnalyticsView(DependencyResolverMixin, APIView):
    """Analytics dashboard data for a chat group."""

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    chat_analytics_use_case = None

    @extend_schema(
        responses={200: ChatAnalyticsResponseSerializer},
        summary="Get chat analytics",
        description="Return analytics dashboard data for a chat group.",
    )
    def get(self, request):
        group_id = request.query_params.get("group_id")
        if not group_id:
            return create_error_response("Group ID not specified", status.HTTP_400_BAD_REQUEST)

        use_case = self.resolve_dependency(self.chat_analytics_use_case)
        try:
            dto = use_case.execute(group_id=int(group_id), user_id=request.user.id)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

        return Response({
            "summary": {
                "total_questions": dto.total_questions,
                "date_range": {
                    "first": dto.date_range.first,
                    "last": dto.date_range.last,
                },
            },
            "scene_distribution": [
                {
                    "video_id": s.video_id,
                    "title": s.title,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "question_count": s.question_count,
                }
                for s in dto.scene_distribution
            ],
            "time_series": [
                {"date": item.date, "count": item.count}
                for item in dto.time_series
            ],
            "feedback": {
                "good": dto.feedback.good,
                "bad": dto.feedback.bad,
                "none": dto.feedback.none,
            },
            "keywords": [
                {"word": item.word, "count": item.count}
                for item in dto.keywords
            ],
        })
