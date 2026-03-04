"""
Presentation layer views for the video domain.
Views are thin HTTP adapters: they validate input, delegate to use cases, and return responses.
"""

import logging

from django.db import transaction
from django.db.models import Count, Prefetch
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.responses import create_error_response
from app.infrastructure.repositories.django_video_repository import (
    DjangoTagRepository,
    DjangoVideoGroupRepository,
    DjangoVideoRepository,
)
from app.models import Tag, Video, VideoGroup, VideoTag
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.delete_video import DeleteVideoUseCase
from app.use_cases.video.exceptions import ResourceNotFound, VideoLimitExceeded
from app.use_cases.video.manage_groups import (
    AddVideoToGroupUseCase,
    AddVideosToGroupUseCase,
    CreateShareLinkUseCase,
    DeleteShareLinkUseCase,
    RemoveVideoFromGroupUseCase,
    ReorderVideosInGroupUseCase,
)
from app.use_cases.video.manage_tags import AddTagsToVideoUseCase, RemoveTagFromVideoUseCase
from app.use_cases.video.update_video import UpdateVideoUseCase
from app.utils.decorators import authenticated_view_with_error_handling
from app.utils.mixins import AuthenticatedViewMixin, DynamicSerializerMixin
from app.utils.query_optimizer import QueryOptimizer

from .serializers import (
    AddTagsToVideoRequestSerializer,
    AddTagsToVideoResponseSerializer,
    AddVideoToGroupResponseSerializer,
    AddVideosToGroupRequestSerializer,
    AddVideosToGroupResponseSerializer,
    ReorderVideosRequestSerializer,
    ShareLinkResponseSerializer,
    TagCreateSerializer,
    TagDetailSerializer,
    TagListSerializer,
    TagUpdateSerializer,
    VideoActionMessageResponseSerializer,
    VideoCreateSerializer,
    VideoGroupCreateSerializer,
    VideoGroupDetailSerializer,
    VideoGroupListSerializer,
    VideoGroupUpdateSerializer,
    VideoListSerializer,
    VideoSerializer,
    VideoUpdateSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Video views
# ---------------------------------------------------------------------------


class BaseVideoView(AuthenticatedViewMixin):
    """Base view that provides the user-scoped video queryset."""

    def get_queryset(self):
        return QueryOptimizer.get_videos_with_metadata(
            user_id=self.request.user.id,
            include_transcript=self.should_include_transcript(),
            include_groups=self.should_include_groups(),
        )

    def should_include_groups(self):
        return False

    def should_include_transcript(self):
        return False


class VideoListView(DynamicSerializerMixin, BaseVideoView, generics.ListCreateAPIView):
    """List videos and upload a new video."""

    serializer_map = {
        "GET": VideoListSerializer,
        "POST": VideoCreateSerializer,
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        q = self.request.query_params.get("q", "").strip()
        status_value = self.request.query_params.get("status", "").strip()
        ordering = self.request.query_params.get("ordering", "").strip()
        tag_ids = self.request.query_params.get("tags", "").strip()

        from django.db.models import Q

        if q:
            queryset = queryset.filter(
                Q(title__icontains=q) | Q(description__icontains=q)
            )
        if status_value:
            queryset = queryset.filter(status=status_value)
        if tag_ids:
            try:
                tag_id_list = [int(tid) for tid in tag_ids.split(",") if tid]
                for tag_id in tag_id_list:
                    queryset = queryset.filter(tags__id=tag_id)
            except ValueError:
                pass

        ordering_map = {
            "uploaded_at_desc": "-uploaded_at",
            "uploaded_at_asc": "uploaded_at",
            "title_asc": "title",
            "title_desc": "-title",
        }
        if ordering in ordering_map:
            queryset = queryset.order_by(ordering_map[ordering])

        return queryset

    @extend_schema(
        request=VideoCreateSerializer,
        responses={201: VideoSerializer},
        summary="Upload video",
        description="Upload a video and return the created video resource.",
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = CreateVideoUseCase(DjangoVideoRepository())
        try:
            video = use_case.execute(request.user, serializer.validated_data)
        except VideoLimitExceeded as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)

        output_serializer = VideoSerializer(
            video, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(output_serializer.data)
        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )


class VideoDetailView(
    DynamicSerializerMixin, BaseVideoView, generics.RetrieveUpdateDestroyAPIView
):
    """Retrieve, update, and delete a video."""

    serializer_map = {
        "GET": VideoSerializer,
        "PUT": VideoUpdateSerializer,
        "PATCH": VideoUpdateSerializer,
    }

    def should_include_groups(self):
        return True

    def should_include_transcript(self):
        return True

    @extend_schema(
        request=VideoUpdateSerializer,
        responses={200: VideoSerializer},
        summary="Update video",
        description="Update a video and return the updated video resource.",
    )
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        use_case = UpdateVideoUseCase(DjangoVideoRepository())
        try:
            updated_video = use_case.execute(
                instance.id, request.user.id, serializer.validated_data
            )
        except ResourceNotFound:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)

        return Response(
            VideoSerializer(updated_video, context=self.get_serializer_context()).data
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        use_case = DeleteVideoUseCase(DjangoVideoRepository())
        try:
            use_case.execute(instance.id, request.user.id)
        except ResourceNotFound:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Video group views
# ---------------------------------------------------------------------------


class BaseVideoGroupView(AuthenticatedViewMixin):
    """Base view for video group operations."""

    def _get_filtered_queryset(self, annotate_only=False):
        return QueryOptimizer.get_video_groups_with_videos(
            user_id=self.request.user.id,
            include_videos=not annotate_only,
            annotate_video_count=True,
        )


class VideoGroupListView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.ListCreateAPIView
):
    """List and create video groups."""

    serializer_map = {
        "GET": VideoGroupListSerializer,
        "POST": VideoGroupCreateSerializer,
    }

    def get_queryset(self):
        return self._get_filtered_queryset(annotate_only=True)

    @extend_schema(
        request=VideoGroupCreateSerializer,
        responses={201: VideoGroupDetailSerializer},
        summary="Create video group",
        description="Create a video group and return the created group resource.",
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        group_repo = DjangoVideoGroupRepository()
        group = group_repo.create(request.user.id, serializer.validated_data)

        instance = self._get_filtered_queryset(annotate_only=False).get(pk=group.pk)
        output_serializer = VideoGroupDetailSerializer(
            instance, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(output_serializer.data)
        return Response(
            output_serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )


class VideoGroupDetailView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.RetrieveUpdateDestroyAPIView
):
    """Retrieve, update, and delete a video group."""

    serializer_map = {
        "GET": VideoGroupDetailSerializer,
        "PUT": VideoGroupUpdateSerializer,
        "PATCH": VideoGroupUpdateSerializer,
    }

    def get_queryset(self):
        return self._get_filtered_queryset(annotate_only=False)

    @extend_schema(
        request=VideoGroupUpdateSerializer,
        responses={200: VideoGroupDetailSerializer},
        summary="Update video group",
        description="Update a video group and return the updated group resource.",
    )
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        group_repo = DjangoVideoGroupRepository()
        group_repo.update(instance, serializer.validated_data)

        instance = self.get_queryset().get(pk=instance.pk)
        return Response(
            VideoGroupDetailSerializer(instance, context=self.get_serializer_context()).data
        )


class AddVideoToGroupView(AuthenticatedViewMixin, APIView):
    """Add a single video to a group."""

    serializer_class = AddVideoToGroupResponseSerializer

    @extend_schema(
        responses={201: AddVideoToGroupResponseSerializer},
        summary="Add video to group",
        description="Add a single video to a group.",
        operation_id="video_groups_add_single_video",
    )
    def post(self, request, group_id, video_id):
        use_case = AddVideoToGroupUseCase(
            DjangoVideoRepository(), DjangoVideoGroupRepository()
        )
        try:
            member = use_case.execute(group_id, video_id, request.user.id)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
        except ValueError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)

        return Response(
            {"message": "Video added to group", "id": member.id},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    request=AddVideosToGroupRequestSerializer,
    responses={201: AddVideosToGroupResponseSerializer},
    summary="Add multiple videos to group",
    description="Add multiple videos to a group. Videos already in the group will be skipped.",
    operation_id="video_groups_add_multiple_videos",
)
@authenticated_view_with_error_handling(["POST"])
@transaction.atomic
def add_videos_to_group(request, group_id):
    """Add multiple videos to group."""
    video_ids = request.data.get("video_ids", [])
    if not video_ids:
        return create_error_response("Video ID not specified", status.HTTP_400_BAD_REQUEST)

    use_case = AddVideosToGroupUseCase(
        DjangoVideoRepository(), DjangoVideoGroupRepository()
    )
    try:
        added_count, skipped_count = use_case.execute(group_id, video_ids, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

    return Response(
        {
            "message": f"Added {added_count} videos to group",
            "added_count": added_count,
            "skipped_count": skipped_count,
        },
        status=status.HTTP_201_CREATED,
    )


@extend_schema(
    responses={200: VideoActionMessageResponseSerializer},
    summary="Remove video from group",
    description="Remove a video from a group.",
)
@authenticated_view_with_error_handling(["DELETE"])
def remove_video_from_group(request, group_id, video_id):
    """Remove video from group."""
    use_case = RemoveVideoFromGroupUseCase(
        DjangoVideoRepository(), DjangoVideoGroupRepository()
    )
    try:
        use_case.execute(group_id, video_id, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
    except ValueError as e:
        return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

    return Response({"message": "Video removed from group"}, status=status.HTTP_200_OK)


@extend_schema(
    request=ReorderVideosRequestSerializer,
    responses={200: VideoActionMessageResponseSerializer},
    summary="Reorder videos in group",
    description="Update the order of videos in a group by providing video IDs in the desired order.",
)
@authenticated_view_with_error_handling(["PATCH"])
def reorder_videos_in_group(request, group_id):
    """Update video order in group."""
    video_ids = request.data.get("video_ids", [])
    if not isinstance(video_ids, list):
        return create_error_response("video_ids must be an array", status.HTTP_400_BAD_REQUEST)

    use_case = ReorderVideosInGroupUseCase(DjangoVideoGroupRepository())
    try:
        use_case.execute(group_id, video_ids, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(str(e), status.HTTP_404_NOT_FOUND)
    except ValueError as e:
        return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)

    return Response({"message": "Video order updated"}, status=status.HTTP_200_OK)


class CreateShareLinkView(AuthenticatedViewMixin, APIView):
    """Generate a share link for a group."""

    serializer_class = ShareLinkResponseSerializer

    @extend_schema(
        responses={201: ShareLinkResponseSerializer},
        summary="Create share link",
        description="Generate a share link token for a group.",
    )
    def post(self, request, group_id):
        use_case = CreateShareLinkUseCase(DjangoVideoGroupRepository())
        try:
            share_token = use_case.execute(group_id, request.user.id)
        except ResourceNotFound as e:
            return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

        return Response(
            {"message": "Share link generated", "share_token": share_token},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    responses={200: VideoActionMessageResponseSerializer},
    summary="Delete share link",
    description="Disable the current share link for a group.",
)
@authenticated_view_with_error_handling(["DELETE"])
def delete_share_link(request, group_id):
    """Disable share link for group."""
    use_case = DeleteShareLinkUseCase(DjangoVideoGroupRepository())
    try:
        use_case.execute(group_id, request.user.id)
    except ResourceNotFound as e:
        msg = str(e)
        if "Share link" in msg:
            return create_error_response("Share link is not configured", status.HTTP_404_NOT_FOUND)
        return create_error_response(msg, status.HTTP_404_NOT_FOUND)

    return Response({"message": "Share link disabled"}, status=status.HTTP_200_OK)


@extend_schema(
    responses={200: VideoGroupDetailSerializer},
    summary="Get shared group",
    description="Return a publicly shared group by share token.",
)
@api_view(["GET"])
@permission_classes([AllowAny])
def get_shared_group(request, share_token):
    """Get group by share token (no authentication required)."""
    group_repo = DjangoVideoGroupRepository()
    group = group_repo.get_by_share_token(share_token)

    if not group:
        return create_error_response("Share link not found", status.HTTP_404_NOT_FOUND)

    serializer = VideoGroupDetailSerializer(group)
    return Response(serializer.data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Tag views
# ---------------------------------------------------------------------------


class BaseTagView(AuthenticatedViewMixin):
    """Base view for tag operations."""

    def get_queryset(self):
        return Tag.objects.filter(user=self.request.user).annotate(
            video_count=Count("video_tags")
        )


class TagListView(DynamicSerializerMixin, BaseTagView, generics.ListCreateAPIView):
    """List and create tags."""

    serializer_map = {
        "GET": TagListSerializer,
        "POST": TagCreateSerializer,
    }

    @extend_schema(
        request=TagCreateSerializer,
        responses={201: TagListSerializer},
        summary="Create tag",
        description="Create a tag and return the created tag resource.",
        operation_id="tags_create",
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tag_repo = DjangoTagRepository()
        tag = tag_repo.create(request.user.id, serializer.validated_data)

        instance = self.get_queryset().get(pk=tag.pk)
        output_serializer = TagListSerializer(
            instance, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(output_serializer.data)
        return Response(
            output_serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )


class TagDetailView(
    DynamicSerializerMixin, BaseTagView, generics.RetrieveUpdateDestroyAPIView
):
    """Retrieve, update, and delete a tag."""

    serializer_map = {
        "GET": TagDetailSerializer,
        "PUT": TagUpdateSerializer,
        "PATCH": TagUpdateSerializer,
    }

    def get_queryset(self):
        return (
            Tag.objects.filter(user=self.request.user)
            .annotate(video_count=Count("video_tags"))
            .prefetch_related(
                Prefetch(
                    "video_tags",
                    queryset=VideoTag.objects.select_related("video").prefetch_related(
                        Prefetch(
                            "video__video_tags",
                            queryset=VideoTag.objects.select_related("tag"),
                        )
                    ),
                )
            )
        )

    @extend_schema(
        request=TagUpdateSerializer,
        responses={200: TagDetailSerializer},
        summary="Update tag",
        description="Update a tag and return the updated tag resource.",
    )
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        tag_repo = DjangoTagRepository()
        tag_repo.update(instance, serializer.validated_data)

        instance = self.get_queryset().get(pk=instance.pk)
        return Response(
            TagDetailSerializer(instance, context=self.get_serializer_context()).data
        )


@extend_schema(
    request=AddTagsToVideoRequestSerializer,
    responses={201: AddTagsToVideoResponseSerializer},
    operation_id="videos_add_tags",
)
@authenticated_view_with_error_handling(["POST"])
def add_tags_to_video(request, video_id):
    """Add multiple tags to video."""
    tag_ids = request.data.get("tag_ids", [])
    if not tag_ids:
        return create_error_response("Tag IDs not specified", status.HTTP_400_BAD_REQUEST)

    use_case = AddTagsToVideoUseCase(DjangoVideoRepository(), DjangoTagRepository())
    try:
        added_count, skipped_count = use_case.execute(video_id, tag_ids, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

    return Response(
        {
            "message": f"Added {added_count} tags to video",
            "added_count": added_count,
            "skipped_count": skipped_count,
        },
        status=status.HTTP_201_CREATED,
    )


@extend_schema(
    responses={200: VideoActionMessageResponseSerializer},
    summary="Remove tag from video",
    description="Remove a tag from a video.",
)
@authenticated_view_with_error_handling(["DELETE"])
def remove_tag_from_video(request, video_id, tag_id):
    """Remove tag from video."""
    use_case = RemoveTagFromVideoUseCase(DjangoVideoRepository(), DjangoTagRepository())
    try:
        use_case.execute(video_id, tag_id, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

    return Response({"message": "Tag removed from video"}, status=status.HTTP_200_OK)
