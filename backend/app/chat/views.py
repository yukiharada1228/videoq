from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (OpenApiParameter, OpenApiResponse,
                                   extend_schema)
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.chat.presenters import write_chat_history_csv
from app.common.authentication import (APIKeyAuthentication,
                                       CookieJWTAuthentication)
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.common.responses import create_error_response
from app.common.throttles import (AuthenticatedChatThrottle,
                                  ShareTokenGlobalThrottle,
                                  ShareTokenIPThrottle)

from .factories import (export_chat_history_use_case,
                        get_chat_analytics_use_case, get_chat_history_use_case,
                        get_popular_scenes_use_case,
                        send_chat_message_use_case,
                        update_chat_feedback_use_case)
from .serializers import (ChatAnalyticsResponseSerializer,
                          ChatFeedbackRequestSerializer,
                          ChatFeedbackResponseSerializer, ChatLogSerializer,
                          ChatRequestSerializer, ChatResponseSerializer)
from .services import ChatServiceError, handle_langchain_exception
from .use_cases import (ExportChatHistoryQuery, GetChatAnalyticsQuery,
                        GetChatHistoryQuery, GetPopularScenesQuery,
                        SendChatMessageCommand, UpdateChatFeedbackCommand)


def _actor_id_from_request(request):
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return user.id


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
        try:
            result = send_chat_message_use_case().execute(
                SendChatMessageCommand(
                    actor_id=_actor_id_from_request(request),
                    messages=request.data.get("messages", []),
                    group_id=request.data.get("group_id"),
                    share_token=request.query_params.get("share_token"),
                    accept_language=request.headers.get("Accept-Language", ""),
                )
            )
            return Response(result.response_data)
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
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
        try:
            result = update_chat_feedback_use_case().execute(
                UpdateChatFeedbackCommand(
                    actor_id=_actor_id_from_request(request),
                    share_token=request.query_params.get("share_token"),
                    chat_log_id=request.data.get("chat_log_id"),
                    feedback=request.data.get("feedback"),
                )
            )
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
        except PermissionError as exc:
            return create_error_response(str(exc), status.HTTP_403_FORBIDDEN)
        return Response(
            {
                "chat_log_id": result.chat_log_id,
                "feedback": result.feedback,
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
        return get_chat_history_use_case().execute(
            GetChatHistoryQuery(
                actor_id=self.request.user.id,
                group_id=group_id,
            )
        )


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

        try:
            group, queryset = export_chat_history_use_case().execute(
                ExportChatHistoryQuery(
                    actor_id=request.user.id,
                    group_id=group_id,
                )
            )
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        except Exception:
            return create_error_response(
                "Specified group not found", status.HTTP_404_NOT_FOUND
            )

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        filename = f"chat_history_group_{group.id}.csv"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'

        write_chat_history_csv(dest=response, chat_logs=queryset)

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
        share_token = request.query_params.get("share_token")
        try:
            limit = int(request.query_params.get("limit", 20))
            limit = max(1, min(limit, 100))
        except (ValueError, TypeError):
            return create_error_response(
                "Invalid limit parameter", status.HTTP_400_BAD_REQUEST
            )

        try:
            result = get_popular_scenes_use_case().execute(
                GetPopularScenesQuery(
                    actor_id=_actor_id_from_request(request),
                    group_id=request.query_params.get("group_id"),
                    share_token=share_token,
                    limit=limit,
                )
            )
            return Response(result)
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)


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
        try:
            result = get_chat_analytics_use_case().execute(
                GetChatAnalyticsQuery(
                    actor_id=_actor_id_from_request(request),
                    group_id=request.query_params.get("group_id"),
                )
            )
            return Response(result)
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
