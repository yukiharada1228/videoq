import csv
import json
import re
from collections import Counter

from django.db.models import Count, Prefetch, Q
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.authentication import CookieJWTAuthentication
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.common.responses import create_error_response
from app.common.throttles import (AuthenticatedChatThrottle,
                                  ShareTokenGlobalThrottle,
                                  ShareTokenIPThrottle)
from app.models import ChatLog, Video, VideoGroup, VideoGroupMember

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
            group = _get_video_group_with_members(group_id, share_token=share_token)
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


def _build_chat_response(result, group_id, group, user, is_shared):
    """Build chat response data and optionally create ChatLog.

    Returns:
        dict: Response data for the chat endpoint.
    """
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

    return response_data


class ChatView(generics.CreateAPIView):
    """Chat view (using LangChain, supports share token)"""

    serializer_class = ChatRequestSerializer
    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
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

            response_data = _build_chat_response(
                result, group_id, group, user, is_shared
            )
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


def _aggregate_scenes(chat_logs):
    """Aggregate scene references from chat logs.

    Returns:
        tuple: (scene_counter, scene_info, scene_questions)
    """
    scene_counter: Counter = Counter()
    scene_info: dict = {}
    scene_questions: dict = {}

    for log in chat_logs:
        related_videos = log.get("related_videos")
        question = log.get("question", "")
        if not related_videos:
            continue
        for rv in related_videos:
            video_id = rv.get("video_id")
            start_time = rv.get("start_time")
            if not video_id or not start_time:
                continue

            key = (video_id, start_time)
            scene_counter[key] += 1

            if key not in scene_info:
                scene_info[key] = {
                    "video_id": video_id,
                    "title": rv.get("title", ""),
                    "start_time": start_time,
                    "end_time": rv.get("end_time") or start_time,
                }

            if question:
                if key not in scene_questions:
                    scene_questions[key] = []
                if (
                    len(scene_questions[key]) < 3
                    and question not in scene_questions[key]
                ):
                    scene_questions[key].append(question)

    return scene_counter, scene_info, scene_questions


def _build_video_file_map(video_ids, owner_user):
    """Build video_id -> file URL mapping."""
    video_file_map = {}
    for video in Video.objects.filter(id__in=video_ids, user=owner_user):
        if video.file:
            try:
                video_file_map[video.id] = video.file.url
            except ValueError:
                video_file_map[video.id] = None
        else:
            video_file_map[video.id] = None
    return video_file_map


def _build_popular_scenes_response(
    top_scenes, scene_info, scene_questions, video_file_map
):
    """Build response list for popular scenes."""
    return [
        {
            "video_id": scene_info[key]["video_id"],
            "title": scene_info[key]["title"],
            "start_time": scene_info[key]["start_time"],
            "end_time": scene_info[key]["end_time"],
            "reference_count": count,
            "file": video_file_map.get(key[0]),
            "questions": scene_questions.get(key, []),
        }
        for key, count in top_scenes
    ]


def _filter_group_scenes(scene_counter, group, limit=None):
    """Keep only scenes that belong to videos currently in the group."""
    valid_video_ids = {member.video_id for member in group.members.all()}
    scenes = [
        (key, count)
        for key, count in scene_counter.most_common()
        if key[0] in valid_video_ids
    ]
    return scenes[:limit] if limit is not None else scenes


class PopularScenesView(APIView):
    """
    Get popular scenes from chat logs for a group.
    Aggregates related_videos from ChatLog and returns frequently referenced scenes.
    GET /api/chat/popular-scenes/?group_id=123
    """

    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
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
                group = _get_video_group_with_members(group_id, share_token=share_token)
            else:
                group = _get_video_group_with_members(group_id, user_id=request.user.id)
        except VideoGroup.DoesNotExist:
            return create_error_response(
                "Specified group not found", status.HTTP_404_NOT_FOUND
            )

        chat_logs = ChatLog.objects.filter(group=group).values(
            "question", "related_videos"
        )

        scene_counter, scene_info, scene_questions = _aggregate_scenes(chat_logs)
        top_scenes = _filter_group_scenes(scene_counter, group, limit)

        video_ids = [key[0] for key, _ in top_scenes]
        video_file_map = _build_video_file_map(video_ids, group.user)

        result = _build_popular_scenes_response(
            top_scenes, scene_info, scene_questions, video_file_map
        )
        return Response(result)


# Japanese: janome noun filtering
_JA_NOUN_POS = ("名詞",)
_JA_NOUN_EXCLUDE_SUBTYPES = ("非自立", "代名詞", "数", "接尾")
_JA_CHAR_RE = re.compile(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]")

# English: NLTK POS tags for content words (nouns + adjectives)
_EN_CONTENT_TAGS = {"NN", "NNS", "NNP", "NNPS", "JJ", "JJR", "JJS"}

_janome_tokenizer = None


def _get_janome_tokenizer():
    global _janome_tokenizer
    if _janome_tokenizer is None:
        from janome.tokenizer import Tokenizer

        _janome_tokenizer = Tokenizer()
    return _janome_tokenizer


def _extract_ja_nouns(text, tokenizer):
    """Extract Japanese nouns using janome."""
    nouns = []
    for token in tokenizer.tokenize(text):
        pos = token.part_of_speech.split(",")
        if pos[0] in _JA_NOUN_POS and pos[1] not in _JA_NOUN_EXCLUDE_SUBTYPES:
            if len(token.surface) >= 2:
                nouns.append(token.surface)
    return nouns


def _extract_en_keywords(text):
    """Extract English content words (nouns + adjectives) using NLTK POS tagging."""
    import nltk

    tokens = nltk.word_tokenize(text.lower())
    tagged = nltk.pos_tag(tokens)
    return [
        word
        for word, tag in tagged
        if tag in _EN_CONTENT_TAGS and len(word) >= 2 and word.isalpha()
    ]


def _extract_keywords(questions, limit=30):
    """Extract top keywords using janome (Japanese) and NLTK (English)."""
    counter: Counter = Counter()
    tokenizer = _get_janome_tokenizer()

    for q in questions:
        if _JA_CHAR_RE.search(q):
            words = _extract_ja_nouns(q, tokenizer)
        else:
            words = _extract_en_keywords(q)
        for word in words:
            counter[word] += 1

    return [{"word": word, "count": count} for word, count in counter.most_common(limit)]


class ChatAnalyticsView(APIView):
    """
    Analytics dashboard data for a chat group.
    GET /api/chat/analytics/?group_id=123
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

        chat_logs_qs = ChatLog.objects.filter(group=group)

        # Summary
        total = chat_logs_qs.count()
        date_range = {}
        if total > 0:
            first_log = chat_logs_qs.order_by("created_at").values_list(
                "created_at", flat=True
            ).first()
            last_log = chat_logs_qs.order_by("-created_at").values_list(
                "created_at", flat=True
            ).first()
            date_range = {
                "first": first_log.isoformat() if first_log else None,
                "last": last_log.isoformat() if last_log else None,
            }

        # Scene distribution (reuse existing helpers)
        logs_for_scenes = chat_logs_qs.values("question", "related_videos")
        scene_counter, scene_info, _ = _aggregate_scenes(logs_for_scenes)
        top_scenes = _filter_group_scenes(scene_counter, group)
        scene_distribution = [
            {
                "video_id": scene_info[key]["video_id"],
                "title": scene_info[key]["title"],
                "start_time": scene_info[key]["start_time"],
                "end_time": scene_info[key]["end_time"],
                "question_count": count,
            }
            for key, count in top_scenes
        ]

        # Time series (daily)
        time_series = list(
            chat_logs_qs.annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
            .values("date", "count")
        )
        for entry in time_series:
            entry["date"] = entry["date"].isoformat()

        # Feedback
        feedback_agg = chat_logs_qs.aggregate(
            good=Count("id", filter=Q(feedback="good")),
            bad=Count("id", filter=Q(feedback="bad")),
            none=Count("id", filter=Q(feedback__isnull=True)),
        )

        # Keywords
        questions = list(chat_logs_qs.values_list("question", flat=True))
        keywords = _extract_keywords(questions)

        return Response(
            {
                "summary": {
                    "total_questions": total,
                    "date_range": date_range,
                },
                "scene_distribution": scene_distribution,
                "time_series": time_series,
                "feedback": feedback_agg,
                "keywords": keywords,
            }
        )
