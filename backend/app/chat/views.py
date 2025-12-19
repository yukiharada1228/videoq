import csv
import json

from django.db.models import Prefetch
from django.http import HttpResponse, StreamingHttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.authentication import CookieJWTAuthentication
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.common.responses import create_error_response
from app.models import ChatLog, VideoGroup, VideoGroupMember

from .serializers import (ChatFeedbackRequestSerializer,
                          ChatFeedbackResponseSerializer, ChatLogSerializer,
                          ChatRequestSerializer, ChatResponseSerializer)
from .services import (RagChatService, get_langchain_llm,
                       handle_langchain_exception)


def _get_chat_logs_queryset(group, ascending=True):
    """
    Get chat log queryset

    Args:
        group: VideoGroup instance
        ascending: Whether to sort ascending (True: ascending, False: descending)

    Returns:
        QuerySet: Chat log queryset
    """
    order_field = "created_at" if ascending else "-created_at"
    return group.chat_logs.select_related("user").order_by(order_field)


def _get_video_group_with_members(group_id, user_id=None, share_token=None):
    """
    Get group and member information

    Args:
        group_id: Group ID
        user_id: User ID (optional)
        share_token: Share token (optional)

    Returns:
        VideoGroup: Group object
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
    """Chat view (using LangChain, supports share token)"""

    serializer_class = ChatRequestSerializer
    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    @extend_schema(
        request=ChatRequestSerializer,
        responses={200: ChatResponseSerializer},
        summary="Send chat message",
        description="Send a chat message and get AI response. Supports RAG when group_id is provided.",
    )
    def post(self, request):
        # Shared token authentication case
        share_token = request.query_params.get("share_token")
        is_shared = share_token is not None
        group = None

        if is_shared:
            # Get group by share token
            group_id = request.data.get("group_id")
            if not group_id:
                return create_error_response(
                    "Group ID not specified", status.HTTP_400_BAD_REQUEST
                )

            try:
                group = _get_video_group_with_members(group_id, share_token=share_token)
                user = group.user  # Group owner's user
            except VideoGroup.DoesNotExist:
                return create_error_response(
                    "Shared group not found", status.HTTP_404_NOT_FOUND
                )
        else:
            # Normal authenticated user
            user = request.user

        # Get LangChain LLM
        llm, error_response = get_langchain_llm(user)
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
            if group_id is not None and not is_shared:
                try:
                    group = _get_video_group_with_members(group_id, user_id=user.id)
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

            response_data = {
                "role": "assistant",
                "content": result.llm_response.content,
            }

            if group_id is not None and result.related_videos:
                response_data["related_videos"] = result.related_videos

            if group_id is not None and group is not None:
                chat_log = ChatLog.objects.create(
                    user=(group.user if is_shared else user),
                    group=group,
                    question=result.query_text,
                    answer=result.llm_response.content,
                    related_videos=result.related_videos or [],
                    is_shared_origin=is_shared,
                )
                response_data["chat_log_id"] = chat_log.id
                response_data["feedback"] = chat_log.feedback

            return Response(response_data)

        except Exception as e:
            return handle_langchain_exception(e)


class ChatStreamView(APIView):
    """Chat streaming view using Server-Sent Events (SSE)"""

    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    @extend_schema(
        request=ChatRequestSerializer,
        responses={200: None},
        summary="Stream chat message",
        description="Stream a chat message and get AI response in real-time using SSE. Supports RAG when group_id is provided.",
    )
    def post(self, request):
        # Shared token authentication case
        share_token = request.query_params.get("share_token")
        is_shared = share_token is not None
        group = None

        if is_shared:
            # Get group by share token
            group_id = request.data.get("group_id")
            if not group_id:
                return self._create_error_stream("Group ID not specified")

            try:
                group = _get_video_group_with_members(group_id, share_token=share_token)
                user = group.user  # Group owner's user
            except VideoGroup.DoesNotExist:
                return self._create_error_stream("Shared group not found")
        else:
            # Normal authenticated user
            user = request.user

        # Get LangChain LLM
        llm, error_response = get_langchain_llm(user)
        if error_response:
            return self._create_error_stream(str(error_response.data.get("error", "LLM initialization failed")))

        # Validate messages
        messages = request.data.get("messages", [])
        if not messages:
            return self._create_error_stream("Messages are empty")

        group_id = request.data.get("group_id")

        # Get group if group_id is specified and not already fetched
        if group_id is not None and not is_shared:
            try:
                group = _get_video_group_with_members(group_id, user_id=user.id)
            except VideoGroup.DoesNotExist:
                return self._create_error_stream("Specified group not found")

        # Get request locale
        accept_language = request.headers.get("Accept-Language", "")
        request_locale = (
            accept_language.split(",")[0].split(";")[0].strip()
            if accept_language
            else ""
        ) or None

        # Create streaming response
        async def event_stream():
            try:
                from asgiref.sync import sync_to_async

                service = RagChatService(user=user, llm=llm)
                full_content = ""
                related_videos = None
                query_text = ""

                # Stream events from service
                for event_type, data in service.run_stream(
                    messages=messages,
                    group=group if group_id is not None else None,
                    locale=request_locale,
                ):
                    if event_type == "token":
                        # Stream LLM tokens
                        full_content += data
                        yield self._format_sse_event({
                            "type": "token",
                            "content": data,
                        })
                    elif event_type == "done":
                        # Completion metadata
                        related_videos = data.get("related_videos")
                        query_text = data.get("query_text", "")
                        full_content = data.get("full_content", full_content)

                # Save chat log after streaming completes
                response_data = {}
                if group_id is not None and related_videos:
                    response_data["related_videos"] = related_videos

                if group_id is not None and group is not None:
                    # Use sync_to_async for database operations in ASGI mode
                    chat_log = await sync_to_async(ChatLog.objects.create)(
                        user=(group.user if is_shared else user),
                        group=group,
                        question=query_text,
                        answer=full_content,
                        related_videos=related_videos or [],
                        is_shared_origin=is_shared,
                    )
                    response_data["chat_log_id"] = chat_log.id
                    response_data["feedback"] = chat_log.feedback

                # Send completion event
                yield self._format_sse_event({
                    "type": "done",
                    **response_data,
                })

            except Exception as e:
                # Send error event
                error_message = str(e)
                yield self._format_sse_event({
                    "type": "error",
                    "message": error_message,
                })

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response

    def _format_sse_event(self, data: dict) -> str:
        """Format data as SSE event"""
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    def _create_error_stream(self, message: str):
        """Create an error event stream"""
        async def error_stream():
            yield self._format_sse_event({
                "type": "error",
                "message": message,
            })

        response = StreamingHttpResponse(error_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class ChatFeedbackView(APIView):
    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
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
            chat_log = ChatLog.objects.select_related("group").get(id=chat_log_id)
        except ChatLog.DoesNotExist:
            return create_error_response(
                "Specified chat history not found", status.HTTP_404_NOT_FOUND
            )

        if share_token:
            if chat_log.group.share_token != share_token:
                return create_error_response(
                    "Share token mismatch", status.HTTP_403_FORBIDDEN
                )
        else:
            if chat_log.group.user_id != request.user.id:
                return create_error_response(
                    "No permission to access this history", status.HTTP_403_FORBIDDEN
                )

        chat_log.feedback = feedback
        chat_log.save(update_fields=["feedback"])

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
    Export group conversation history as CSV.
    Only the owner is allowed.
    GET /api/chat/history/export/?group_id=123
    """

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        group_id = request.query_params.get("group_id")
        if not group_id:
            return create_error_response(
                "Group ID not specified", status.HTTP_400_BAD_REQUEST
            )

        try:
            group = _get_video_group_with_members(group_id, user_id=request.user.id)
        except VideoGroup.DoesNotExist:
            return create_error_response(
                "Specified group not found", status.HTTP_404_NOT_FOUND
            )

        queryset = _get_chat_logs_queryset(group, ascending=True)

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
