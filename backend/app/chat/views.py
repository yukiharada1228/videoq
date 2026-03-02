import csv
import json

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (OpenApiParameter, OpenApiResponse,
                                   extend_schema)
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.common.responses import create_error_response
from app.common.throttles import (AuthenticatedChatThrottle,
                                  ShareTokenGlobalThrottle,
                                  ShareTokenIPThrottle)
from app.models import ChatLog, VideoGroup

from .serializers import (ChatFeedbackRequestSerializer,
                          ChatAnalyticsResponseSerializer,
                          ChatFeedbackResponseSerializer, ChatLogSerializer,
                          ChatRequestSerializer, ChatResponseSerializer)
from .services import (ChatServiceError, RagChatService,
                       build_chat_analytics, build_popular_scenes,
                       create_chat_response_payload, get_chat_logs_queryset,
                       get_langchain_llm, get_video_group_with_members,
                       handle_langchain_exception, update_chat_feedback)


def _resolve_chat_context(request):
    """Resolve authentication context for chat request.

    Returns:
        tuple: (user, group, is_shared, error_response)
        If error_response is not None, return it immediately.
    """
    share_token = request.query_params.get("share_token")
    is_shared = share_token is not None

    if is_shared:
        group_id = request.data.get("group_id")
        if not group_id:
            return (
                None,
                None,
                is_shared,
                create_error_response(
                    "Group ID not specified", status.HTTP_400_BAD_REQUEST
                ),
            )
        try:
            group = get_video_group_with_members(group_id, share_token=share_token)
            return group.user, group, is_shared, None
        except VideoGroup.DoesNotExist:
            return (
                None,
                None,
                is_shared,
                create_error_response(
                    "Shared group not found", status.HTTP_404_NOT_FOUND
                ),
            )
    else:
        return request.user, None, is_shared, None


class ChatView(generics.CreateAPIView):
    """Chat view (using LangChain, supports share token)"""

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
        user, group, is_shared, error_response = _resolve_chat_context(request)
        if error_response:
            return error_response

        # Validate messages
        messages = request.data.get("messages", [])
        if not messages:
            return create_error_response(
                "Messages are empty", status.HTTP_400_BAD_REQUEST
            )

        group_id = request.data.get("group_id")
        try:
            llm = get_langchain_llm(user)

            if group_id is not None and not is_shared:
                try:
                    group = get_video_group_with_members(group_id, user_id=user.id)
                except VideoGroup.DoesNotExist:
                    return create_error_response(
                        "Specified group not found", status.HTTP_404_NOT_FOUND
                    )

            service = RagChatService(user=user, llm=llm)
            accept_language = request.headers.get("Accept-Language", "")
            request_locale = (
                accept_language.split(",")[0].split(";")[0].strip()
                if accept_language
                else ""
            ) or None

            result = service.run(
                messages=messages,
                group=group if group_id is not None else None,
                locale=request_locale,
            )

            response_data = create_chat_response_payload(
                result, group_id, group, user, is_shared
            )
            return Response(response_data)

        except ChatServiceError as exc:
            return create_error_response(exc.message, exc.status_code)
        except Exception as e:
            error = handle_langchain_exception(e)
            return create_error_response(error.message, error.status_code)


class ChatFeedbackView(APIView):
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
        description="Submit feedback (good/bad) for a chat log. Supports share token authentication.",
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

        valid_feedback = {
            None,
            ChatLog.FeedbackChoices.GOOD,
            ChatLog.FeedbackChoices.BAD,
        }

        if feedback not in valid_feedback:
            return create_error_response(
                "feedback must be 'good', 'bad', or null (unspecified)",
                status.HTTP_400_BAD_REQUEST,
            )

        try:
            chat_log = update_chat_feedback(
                chat_log_id=chat_log_id,
                feedback=feedback,
                request_user=request.user,
                share_token=share_token,
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
        except PermissionError as exc:
            return create_error_response(str(exc), status.HTTP_403_FORBIDDEN)

        return Response(
            {
                "chat_log_id": chat_log.id,
                "feedback": chat_log.feedback,
            }
        )


class ChatHistoryView(generics.ListAPIView):
    """
    Get conversation history for a group. Only the owner can access.
    GET /api/chat/history/?group_id=123
    """

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]
    serializer_class = ChatLogSerializer

    def get_queryset(self):
        group_id = self.request.query_params.get("group_id")
        if not group_id:
            return ChatLog.objects.none()

        try:
            group = get_video_group_with_members(
                group_id, user_id=self.request.user.id
            )
        except VideoGroup.DoesNotExist:
            return ChatLog.objects.none()

        return get_chat_logs_queryset(group, ascending=False)


class ChatHistoryExportView(APIView):
    """
    Export group conversation history as CSV.
    Only the owner is allowed.
    GET /api/chat/history/export/?group_id=123
    """

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

        try:
            group = get_video_group_with_members(group_id, user_id=request.user.id)
        except VideoGroup.DoesNotExist:
            return create_error_response(
                "Specified group not found", status.HTTP_404_NOT_FOUND
            )

        queryset = get_chat_logs_queryset(group, ascending=True)

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        filename = f"chat_history_group_{group.id}.csv"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        writer = csv.writer(response)
        # Header
        writer.writerow(
            [
                "created_at",
                "question",
                "answer",
                "is_shared_origin",
                "related_videos",
                "feedback",
            ]
        )

        for log in queryset:
            # related_videos is stored as JSON string
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
                    log.feedback or "",
                ]
            )

        return response

class PopularScenesView(APIView):
    """
    Get popular scenes from chat logs for a group.
    Aggregates related_videos from ChatLog and returns frequently referenced scenes.
    GET /api/chat/popular-scenes/?group_id=123
    """

    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="group_id",
                type=int,
                required=True,
                description="The ID of the video group",
            ),
            OpenApiParameter(
                name="limit",
                type=int,
                required=False,
                description="Maximum number of scenes to return (default: 20)",
            ),
            OpenApiParameter(
                name="share_token",
                type=str,
                required=False,
                description="Share token for shared access",
            ),
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
                        "questions": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
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
            limit = int(request.query_params.get("limit", 20))
            limit = max(1, min(limit, 100))
        except (ValueError, TypeError):
            return create_error_response(
                "Invalid limit parameter", status.HTTP_400_BAD_REQUEST
            )

        if not group_id:
            return create_error_response(
                "Group ID not specified", status.HTTP_400_BAD_REQUEST
            )

        try:
            if share_token:
                group = get_video_group_with_members(
                    group_id, share_token=share_token
                )
            else:
                group = get_video_group_with_members(group_id, user_id=request.user.id)
        except VideoGroup.DoesNotExist:
            return create_error_response(
                "Specified group not found", status.HTTP_404_NOT_FOUND
            )

        result = build_popular_scenes(group, limit=limit)
        return Response(result)


class ChatAnalyticsView(APIView):
    """
    Analytics dashboard data for a chat group.
    GET /api/chat/analytics/?group_id=123
    """

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
            return create_error_response(
                "Group ID not specified", status.HTTP_400_BAD_REQUEST
            )

        try:
            group = get_video_group_with_members(group_id, user_id=request.user.id)
        except VideoGroup.DoesNotExist:
            return create_error_response(
                "Specified group not found", status.HTTP_404_NOT_FOUND
            )

        return Response(build_chat_analytics(group))
