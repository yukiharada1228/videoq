"""Presentation views for evaluation domain."""

import logging

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.dependencies import evaluation as eval_deps
from app.presentation.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.presentation.common.responses import create_error_response
from app.use_cases.shared.exceptions import ResourceNotFound

from .serializers import ChatLogEvaluationSerializer, EvaluationSummarySerializer

logger = logging.getLogger(__name__)


class EvaluationSummaryView(APIView):
    """Return aggregated RAGAS scores for a video group."""

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[OpenApiParameter("group_id", int, required=True)],
        responses={200: EvaluationSummarySerializer},
        summary="Get evaluation summary",
        description="Return averaged RAGAS scores for all evaluated chats in a group.",
    )
    def get(self, request):
        group_id = request.query_params.get("group_id")
        if not group_id:
            return create_error_response("group_id not specified", status.HTTP_400_BAD_REQUEST)

        uc = eval_deps.get_get_evaluation_summary_use_case()
        try:
            dto = uc.execute(group_id=int(group_id), user_id=request.user.id)
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)

        return Response(EvaluationSummarySerializer({
            "group_id": dto.group_id,
            "evaluated_count": dto.evaluated_count,
            "avg_faithfulness": dto.avg_faithfulness,
            "avg_answer_relevancy": dto.avg_answer_relevancy,
            "avg_context_precision": dto.avg_context_precision,
        }).data)


class EvaluationLogsView(APIView):
    """Return per-ChatLog RAGAS evaluation results for a group."""

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter("group_id", int, required=True),
            OpenApiParameter("limit", int, required=False),
            OpenApiParameter("offset", int, required=False),
        ],
        responses={200: ChatLogEvaluationSerializer(many=True)},
        summary="List chat log evaluations",
        description="Return paginated RAGAS evaluation scores for a group's chat logs.",
    )
    def get(self, request):
        group_id = request.query_params.get("group_id")
        if not group_id:
            return create_error_response("group_id not specified", status.HTTP_400_BAD_REQUEST)

        try:
            limit = int(request.query_params.get("limit", 50))
            offset = int(request.query_params.get("offset", 0))
        except (TypeError, ValueError):
            return create_error_response("limit/offset must be integers", status.HTTP_400_BAD_REQUEST)

        uc = eval_deps.get_list_chat_log_evaluations_use_case()
        try:
            entities = uc.execute(
                group_id=int(group_id),
                user_id=request.user.id,
                limit=limit,
                offset=offset,
            )
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)

        data = [
            {
                "chat_log_id": e.chat_log_id,
                "status": e.status,
                "faithfulness": e.faithfulness,
                "answer_relevancy": e.answer_relevancy,
                "context_precision": e.context_precision,
                "error_message": e.error_message,
                "evaluated_at": e.evaluated_at,
            }
            for e in entities
        ]
        return Response(ChatLogEvaluationSerializer(data, many=True).data)
