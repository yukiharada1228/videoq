"""PLOG HTTP views."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from app.presentation.common.authentication import (
    APIKeyAuthentication,
    CookieJWTAuthentication,
)
from app.presentation.common.mixins import DependencyResolverMixin
from app.presentation.common.permissions import ApiKeyScopePermission
from app.presentation.common.responses import create_error_response
from app.use_cases.plog.get_graph import concept_dto_to_dict, edge_dto_to_dict
from app.use_cases.shared.exceptions import ResourceNotFound


class PlogGraphView(DependencyResolverMixin, APIView):
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "read"
    get_plog_graph_use_case = None

    def get(self, request, video_id: int):
        use_case = self.resolve_dependency(self.get_plog_graph_use_case)
        try:
            dto = use_case.execute(video_id=video_id, user_id=request.user.id)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "video_id": dto.video_id,
                "build_status": dto.build_status,
                "input_tokens": dto.input_tokens,
                "output_tokens": dto.output_tokens,
                "error_message": dto.error_message,
                "summary_node_count": dto.summary_node_count,
                "concepts": [concept_dto_to_dict(c) for c in dto.concepts],
                "edges": [edge_dto_to_dict(e) for e in dto.edges],
            }
        )


class PlogRebuildView(DependencyResolverMixin, APIView):
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "write"
    rebuild_plog_use_case = None

    def post(self, request, video_id: int):
        use_case = self.resolve_dependency(self.rebuild_plog_use_case)
        try:
            result = use_case.execute(video_id=video_id, user_id=request.user.id)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        return Response(result, status=status.HTTP_202_ACCEPTED)


class PlogConceptListView(DependencyResolverMixin, APIView):
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "write"
    edit_plog_graph_use_case = None

    def post(self, request, video_id: int):
        use_case = self.resolve_dependency(
            self.edit_plog_graph_use_case, require_execute=False
        )
        try:
            result = use_case.create_concept(
                video_id=video_id,
                user_id=request.user.id,
                label=request.data.get("label") or "",
                node_type=request.data.get("node_type") or "object",
                intro_sec=float(request.data.get("intro_sec") or 0.0),
                source_quote=request.data.get("source_quote") or "",
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except (ValueError, TypeError) as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)


class PlogConceptDetailView(DependencyResolverMixin, APIView):
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "write"
    edit_plog_graph_use_case = None

    def patch(self, request, video_id: int, concept_id: int):
        use_case = self.resolve_dependency(
            self.edit_plog_graph_use_case, require_execute=False
        )
        kwargs = {}
        for key in ("label", "node_type", "source_quote"):
            if key in request.data:
                kwargs[key] = request.data.get(key)
        if "intro_sec" in request.data:
            try:
                kwargs["intro_sec"] = float(request.data.get("intro_sec"))
            except (TypeError, ValueError):
                return create_error_response("intro_sec must be a number", status.HTTP_400_BAD_REQUEST)
        try:
            result = use_case.update_concept(
                video_id=video_id,
                user_id=request.user.id,
                concept_id=concept_id,
                **kwargs,
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return Response(result)

    def delete(self, request, video_id: int, concept_id: int):
        use_case = self.resolve_dependency(
            self.edit_plog_graph_use_case, require_execute=False
        )
        try:
            result = use_case.delete_concept(
                video_id=video_id, user_id=request.user.id, concept_id=concept_id
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        return Response(result)


class PlogConceptMergeView(DependencyResolverMixin, APIView):
    """Human granularity adjudication: merge absorb_id into this concept."""

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "write"
    edit_plog_graph_use_case = None

    def post(self, request, video_id: int, concept_id: int):
        use_case = self.resolve_dependency(
            self.edit_plog_graph_use_case, require_execute=False
        )
        try:
            absorb_id = int(request.data.get("absorb_id"))
            result = use_case.merge_concepts(
                video_id=video_id,
                user_id=request.user.id,
                survivor_id=concept_id,
                absorb_id=absorb_id,
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except (ValueError, TypeError) as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return Response(result)


class PlogLearningObjectView(DependencyResolverMixin, APIView):
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "write"
    edit_plog_graph_use_case = None

    def patch(self, request, video_id: int, concept_id: int):
        use_case = self.resolve_dependency(
            self.edit_plog_graph_use_case, require_execute=False
        )
        kwargs = {}
        for key in (
            "opening_question",
            "hint_ladder",
            "misconceptions",
            "canonical_order",
            "worked_examples",
            "waypoints",
        ):
            if key in request.data:
                kwargs[key] = request.data.get(key)
        try:
            result = use_case.update_learning_object(
                video_id=video_id,
                user_id=request.user.id,
                concept_id=concept_id,
                **kwargs,
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return Response(result)


class PlogEdgeListView(DependencyResolverMixin, APIView):
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "write"
    edit_plog_graph_use_case = None

    def post(self, request, video_id: int):
        use_case = self.resolve_dependency(
            self.edit_plog_graph_use_case, require_execute=False
        )
        try:
            result = use_case.create_edge(
                video_id=video_id,
                user_id=request.user.id,
                source_id=int(request.data.get("source_id")),
                target_id=int(request.data.get("target_id")),
                edge_type=request.data.get("edge_type") or "",
                quote=request.data.get("quote") or "",
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except (ValueError, TypeError) as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)


class PlogEdgeDetailView(DependencyResolverMixin, APIView):
    """PATCH / DELETE a single edge (existence, edit, or delete — no accept/reject)."""

    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "write"
    edit_plog_graph_use_case = None

    def patch(self, request, video_id: int, edge_id: int):
        data = request.data or {}
        use_case = self.resolve_dependency(
            self.edit_plog_graph_use_case, require_execute=False
        )
        kwargs = {}
        for key in ("edge_type", "quote"):
            if key in data:
                kwargs[key] = data.get(key)
        for key in ("source_id", "target_id"):
            if key in data:
                raw = data.get(key)
                try:
                    kwargs[key] = int(raw)  # type: ignore[arg-type]
                except (TypeError, ValueError):
                    return create_error_response(
                        f"{key} must be an integer", status.HTTP_400_BAD_REQUEST
                    )
        if not kwargs:
            return create_error_response(
                "Provide at least one of: source_id, target_id, edge_type, quote",
                status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = use_case.update_edge(
                video_id=video_id,
                user_id=request.user.id,
                edge_id=edge_id,
                **kwargs,
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return Response(result)

    def delete(self, request, video_id: int, edge_id: int):
        use_case = self.resolve_dependency(
            self.edit_plog_graph_use_case, require_execute=False
        )
        try:
            result = use_case.delete_edge(
                video_id=video_id, user_id=request.user.id, edge_id=edge_id
            )
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        return Response(result)


class PlogLearnerStateView(DependencyResolverMixin, APIView):
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, ApiKeyScopePermission]
    required_scope = "read"
    get_learner_state_use_case = None
    reset_learner_state_use_case = None

    def get(self, request, video_id: int):
        use_case = self.resolve_dependency(self.get_learner_state_use_case)
        try:
            items = use_case.execute(video_id=video_id, user_id=request.user.id)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "states": [
                    {
                        "concept_id": s.concept_id,
                        "label": s.label,
                        "reached": s.reached,
                        "hint_index": s.hint_index,
                        "last_grade": s.last_grade,
                        "active": s.active,
                    }
                    for s in items
                ]
            }
        )

    def delete(self, request, video_id: int):
        use_case = self.resolve_dependency(self.reset_learner_state_use_case)
        try:
            result = use_case.execute(video_id=video_id, user_id=request.user.id)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        return Response(result)
