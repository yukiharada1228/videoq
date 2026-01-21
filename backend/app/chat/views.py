import csv
import json


from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.authentication import CookieJWTAuthentication
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.common.responses import create_error_response
from app.models import ChatLog, VideoGroup

from .serializers import (ChatFeedbackRequestSerializer,
                          ChatFeedbackResponseSerializer, ChatLogSerializer,
                          ChatRequestSerializer, ChatResponseSerializer)
from .services import (ChatService, RagChatService, get_langchain_llm,
                       handle_langchain_exception)
from app.video.services import VideoGroupService





class ChatView(generics.CreateAPIView):
    """Chat view (using LangChain, supports share token)"""

    serializer_class = ChatRequestSerializer
    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    @extend_schema(
        request=ChatRequestSerializer,
        responses={200: ChatResponseSerializer},
        summary="Send chat message",
        description="Send a chat message and get AI response. Supports RAG when group_id is provided. Share token should be provided in the request body for shared access.",
    )
    def post(self, request):
        # Shared token authentication case
        share_token = request.data.get("share_token")
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
                group = VideoGroupService.get_video_group_with_members(
                    group_id, share_token=share_token
                )
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
                    group = VideoGroupService.get_video_group_with_members(
                        group_id, user_id=user.id
                    )
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


class ChatFeedbackView(APIView):
    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    @extend_schema(
        request=ChatFeedbackRequestSerializer,
        responses={200: ChatFeedbackResponseSerializer},
        summary="Submit chat feedback",
        description="Submit feedback (good/bad) for a chat log. Share token should be provided in the request body for shared access.",
    )
    def post(self, request):
        share_token = request.data.get("share_token")
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
            group = VideoGroupService.get_video_group_with_members(
                group_id, user_id=self.request.user.id
            )
        except VideoGroup.DoesNotExist:
            return ChatLog.objects.none()

        return ChatService.get_chat_logs_queryset(group, ascending=False)


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
            group = VideoGroupService.get_video_group_with_members(
                group_id, user_id=request.user.id
            )
        except VideoGroup.DoesNotExist:
            return create_error_response(
                "Specified group not found", status.HTTP_404_NOT_FOUND
            )

        queryset = ChatService.get_chat_logs_queryset(group, ascending=True)

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
