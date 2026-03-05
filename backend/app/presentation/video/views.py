"""
Presentation layer views for the video domain.
Views are thin HTTP adapters: they validate input, delegate to use cases, and return responses.
"""

import logging

from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.responses import create_error_response
from app.container import get_container
from app.use_cases.video.dto import (
    CreateGroupInput,
    CreateTagInput,
    CreateVideoInput,
    UpdateGroupInput,
    UpdateTagInput,
    UpdateVideoInput,
)
from app.use_cases.video.exceptions import ResourceNotFound, VideoLimitExceeded
from app.presentation.common.mixins import AuthenticatedViewMixin
from app.presentation.common.decorators import authenticated_view_with_error_handling

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


class VideoListView(AuthenticatedViewMixin, generics.GenericAPIView):
    """List videos and upload a new video."""

    serializer_class = VideoListSerializer

    @extend_schema(
        responses={200: VideoListSerializer(many=True)},
        summary="List videos",
        description="Return a filtered list of videos for the current user.",
    )
    def get(self, request, *args, **kwargs):
        q = request.query_params.get("q", "").strip()
        status_value = request.query_params.get("status", "").strip()
        ordering = request.query_params.get("ordering", "").strip()
        tag_ids_param = request.query_params.get("tags", "").strip()

        tag_ids = None
        if tag_ids_param:
            try:
                tag_ids = [int(tid) for tid in tag_ids_param.split(",") if tid]
            except ValueError:
                pass

        container = get_container()
        use_case = container.get_list_videos_use_case()
        videos = use_case.execute(
            user_id=request.user.id,
            q=q,
            status=status_value,
            ordering=ordering,
            tag_ids=tag_ids,
        )
        ctx = {"request": request}
        return Response(
            VideoListSerializer(videos, many=True, context=ctx).data
        )

    @extend_schema(
        request=VideoCreateSerializer,
        responses={201: VideoSerializer},
        summary="Upload video",
        description="Upload a video and return the created video resource.",
    )
    def post(self, request, *args, **kwargs):
        serializer = VideoCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        container = get_container()
        use_case = container.get_create_video_use_case()
        try:
            input_dto = CreateVideoInput(**serializer.validated_data)
            video = use_case.execute(request.user.id, request.user.video_limit, input_dto)
        except VideoLimitExceeded as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)

        ctx = {"request": request}
        return Response(
            VideoSerializer(video, context=ctx).data,
            status=status.HTTP_201_CREATED,
        )


class VideoDetailView(AuthenticatedViewMixin, APIView):
    """Retrieve, update, and delete a video."""

    def _get_video(self, pk, user_id):
        return get_container().get_video_detail_use_case().execute(pk, user_id)

    @extend_schema(
        responses={200: VideoSerializer},
        summary="Get video",
        description="Return a video by ID.",
    )
    def get(self, request, pk):
        video = self._get_video(pk, request.user.id)
        if video is None:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)
        ctx = {"request": request}
        return Response(VideoSerializer(video, context=ctx).data)

    @extend_schema(
        request=VideoUpdateSerializer,
        responses={200: VideoSerializer},
        summary="Update video",
        description="Update a video and return the updated video resource.",
    )
    def patch(self, request, pk):
        video = self._get_video(pk, request.user.id)
        if video is None:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)

        serializer = VideoUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        container = get_container()
        use_case = container.get_update_video_use_case()
        try:
            data = serializer.validated_data
            input_dto = UpdateVideoInput(
                title=data.get("title"),
                description=data.get("description"),
            )
            updated = use_case.execute(pk, request.user.id, input_dto)
        except ResourceNotFound:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)

        ctx = {"request": request}
        return Response(VideoSerializer(updated, context=ctx).data)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        use_case = get_container().get_delete_video_use_case()
        try:
            use_case.execute(pk, request.user.id)
        except ResourceNotFound:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Video group views
# ---------------------------------------------------------------------------


class VideoGroupListView(AuthenticatedViewMixin, generics.GenericAPIView):
    """List and create video groups."""

    serializer_class = VideoGroupListSerializer

    @extend_schema(
        responses={200: VideoGroupListSerializer(many=True)},
        summary="List video groups",
        description="Return all video groups for the current user.",
    )
    def get(self, request, *args, **kwargs):
        use_case = get_container().get_list_groups_use_case()
        groups = use_case.execute(user_id=request.user.id, annotate_only=True)
        return Response(VideoGroupListSerializer(groups, many=True).data)

    @extend_schema(
        request=VideoGroupCreateSerializer,
        responses={201: VideoGroupDetailSerializer},
        summary="Create video group",
        description="Create a video group and return the created group resource.",
    )
    def post(self, request, *args, **kwargs):
        serializer = VideoGroupCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        container = get_container()
        use_case = container.get_create_group_use_case()
        input_dto = CreateGroupInput(**serializer.validated_data)
        group = use_case.execute(request.user.id, input_dto)

        # Re-fetch with videos for detail response
        detail_use_case = container.get_video_group_use_case()
        try:
            group = detail_use_case.execute(group.id, request.user.id, include_videos=True)
        except ResourceNotFound:
            pass

        ctx = {"request": request}
        return Response(
            VideoGroupDetailSerializer(group, context=ctx).data,
            status=status.HTTP_201_CREATED,
        )


class VideoGroupDetailView(AuthenticatedViewMixin, APIView):
    """Retrieve, update, and delete a video group."""

    @extend_schema(
        responses={200: VideoGroupDetailSerializer},
        summary="Get video group",
        description="Return a video group by ID.",
    )
    def get(self, request, pk):
        container = get_container()
        use_case = container.get_video_group_use_case()
        try:
            group = use_case.execute(pk, request.user.id, include_videos=True)
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)
        ctx = {"request": request}
        return Response(VideoGroupDetailSerializer(group, context=ctx).data)

    @extend_schema(
        request=VideoGroupUpdateSerializer,
        responses={200: VideoGroupDetailSerializer},
        summary="Update video group",
        description="Update a video group and return the updated group resource.",
    )
    def patch(self, request, pk):
        serializer = VideoGroupUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        container = get_container()
        use_case = container.get_update_group_use_case()
        try:
            data = serializer.validated_data
            input_dto = UpdateGroupInput(
                name=data.get("name"),
                description=data.get("description"),
            )
            use_case.execute(pk, request.user.id, input_dto)
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)

        # Re-fetch with videos
        detail_use_case = container.get_video_group_use_case()
        try:
            group = detail_use_case.execute(pk, request.user.id, include_videos=True)
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)

        ctx = {"request": request}
        return Response(VideoGroupDetailSerializer(group, context=ctx).data)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        use_case = get_container().get_delete_group_use_case()
        try:
            use_case.execute(pk, request.user.id)
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        use_case = get_container().get_add_video_to_group_use_case()
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
def add_videos_to_group(request, group_id):
    """Add multiple videos to group."""
    video_ids = request.data.get("video_ids", [])
    if not video_ids:
        return create_error_response("Video ID not specified", status.HTTP_400_BAD_REQUEST)

    use_case = get_container().get_add_videos_to_group_use_case()
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
    use_case = get_container().get_remove_video_from_group_use_case()
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

    use_case = get_container().get_reorder_videos_use_case()
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
        use_case = get_container().get_create_share_link_use_case()
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
    use_case = get_container().get_delete_share_link_use_case()
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
    container = get_container()
    use_case = container.get_shared_group_use_case()
    try:
        group = use_case.execute(share_token)
    except ResourceNotFound:
        return create_error_response("Share link not found", status.HTTP_404_NOT_FOUND)

    ctx = {}
    return Response(VideoGroupDetailSerializer(group, context=ctx).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Tag views
# ---------------------------------------------------------------------------


class TagListView(AuthenticatedViewMixin, generics.GenericAPIView):
    """List and create tags."""

    serializer_class = TagListSerializer

    @extend_schema(
        responses={200: TagListSerializer(many=True)},
        summary="List tags",
        description="Return all tags for the current user.",
        operation_id="tags_list",
    )
    def get(self, request, *args, **kwargs):
        use_case = get_container().get_list_tags_use_case()
        tags = use_case.execute(user_id=request.user.id)
        return Response(TagListSerializer(tags, many=True).data)

    @extend_schema(
        request=TagCreateSerializer,
        responses={201: TagListSerializer},
        summary="Create tag",
        description="Create a tag and return the created tag resource.",
        operation_id="tags_create",
    )
    def post(self, request, *args, **kwargs):
        serializer = TagCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = get_container().get_create_tag_use_case()
        input_dto = CreateTagInput(**serializer.validated_data)
        tag = use_case.execute(request.user.id, input_dto)
        return Response(TagListSerializer(tag).data, status=status.HTTP_201_CREATED)


class TagDetailView(AuthenticatedViewMixin, APIView):
    """Retrieve, update, and delete a tag."""

    @extend_schema(
        responses={200: TagDetailSerializer},
        summary="Get tag detail",
        description="Return a tag with its associated videos.",
    )
    def get(self, request, pk):
        container = get_container()
        use_case = container.get_tag_detail_use_case()
        try:
            tag = use_case.execute(pk, request.user.id)
        except ResourceNotFound:
            return create_error_response("Tag not found", status.HTTP_404_NOT_FOUND)
        ctx = {"request": request}
        return Response(TagDetailSerializer(tag, context=ctx).data)

    @extend_schema(
        request=TagUpdateSerializer,
        responses={200: TagDetailSerializer},
        summary="Update tag",
        description="Update a tag and return the updated tag resource.",
    )
    def patch(self, request, pk):
        serializer = TagUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        container = get_container()
        use_case = container.get_update_tag_use_case()
        try:
            data = serializer.validated_data
            input_dto = UpdateTagInput(
                name=data.get("name"),
                color=data.get("color"),
            )
            use_case.execute(pk, request.user.id, input_dto)
        except ResourceNotFound:
            return create_error_response("Tag not found", status.HTTP_404_NOT_FOUND)

        # Re-fetch with videos for detail response
        detail_use_case = container.get_tag_detail_use_case()
        try:
            tag = detail_use_case.execute(pk, request.user.id)
        except ResourceNotFound:
            return create_error_response("Tag not found", status.HTTP_404_NOT_FOUND)

        ctx = {"request": request}
        return Response(TagDetailSerializer(tag, context=ctx).data)

    def put(self, request, pk):
        return self.patch(request, pk)

    def delete(self, request, pk):
        use_case = get_container().get_delete_tag_use_case()
        try:
            use_case.execute(pk, request.user.id)
        except ResourceNotFound:
            return create_error_response("Tag not found", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


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

    use_case = get_container().get_add_tags_to_video_use_case()
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
    use_case = get_container().get_remove_tag_from_video_use_case()
    try:
        use_case.execute(video_id, tag_id, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(str(e), status.HTTP_404_NOT_FOUND)

    return Response({"message": "Tag removed from video"}, status=status.HTTP_200_OK)
