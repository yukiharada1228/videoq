"""
Presentation layer views for the video domain.
Views are thin HTTP adapters: they validate input, delegate to use cases, and return responses.
"""

import logging

from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app.presentation.common.responses import create_error_response
from app.presentation.common.throttles import ShareTokenIPThrottle
from app.use_cases.billing.exceptions import StorageLimitExceeded
from app.use_cases.video.dto import (
    CreateGroupInput,
    CreateTagInput,
    CreateVideoInput,
    CreateYoutubeVideoInput,
    ListVideosInput,
    RequestUploadInput,
    UpdateGroupInput,
    UpdateTagInput,
    UpdateVideoInput,
)
from app.use_cases.video.exceptions import (
    FileSizeExceeded,
    GroupVideoOrderMismatch,
    InvalidShareSlugInput,
    InvalidTagInput,
    InvalidUploadState,
    ResourceNotFound,
    ShareSlugAlreadyExists,
    VideoAlreadyInGroup,
    VideoNotInGroup,
)
from app.presentation.common.mixins import AuthenticatedViewMixin, DependencyResolverMixin
from app.presentation.common.decorators import authenticated_view_with_error_handling

from .serializers import (
    AddTagsToVideoRequestSerializer,
    AddTagsToVideoResponseSerializer,
    AddVideoToGroupResponseSerializer,
    AddVideosToGroupRequestSerializer,
    AddVideosToGroupResponseSerializer,
    ReorderVideosRequestSerializer,
    ShareLinkRequestSerializer,
    ShareLinkResponseSerializer,
    TagCreateSerializer,
    TagDetailSerializer,
    TagFullUpdateSerializer,
    TagListSerializer,
    TagUpdateSerializer,
    VideoActionMessageResponseSerializer,
    VideoCreateSerializer,
    VideoFullUpdateSerializer,
    VideoGroupCreateSerializer,
    VideoGroupDetailSerializer,
    VideoGroupFullUpdateSerializer,
    VideoGroupListSerializer,
    VideoGroupUpdateSerializer,
    VideoListSerializer,
    VideoSerializer,
    VideoUpdateSerializer,
    VideoUploadRequestResponseSerializer,
    VideoUploadRequestSerializer,
    YoutubeVideoCreateSerializer,
)

logger = logging.getLogger(__name__)

NOT_FOUND_MESSAGES = {
    "Group": "Group not found",
    "Share link": "Share link is not configured",
    "Some videos": "Some videos not found",
    "Tag": "Tag not found",
    "Video": "Video not found",
}


def _not_found_message(exc: ResourceNotFound) -> str:
    return NOT_FOUND_MESSAGES.get(exc.entity_name, "Resource not found")


# ---------------------------------------------------------------------------
# Video views
# ---------------------------------------------------------------------------


class VideoListView(DependencyResolverMixin, AuthenticatedViewMixin, generics.GenericAPIView):
    """List videos and upload a new video."""

    serializer_class = VideoListSerializer
    list_videos_use_case = None
    create_video_use_case = None

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

        use_case = self.resolve_dependency(self.list_videos_use_case)
        input_dto = ListVideosInput(
            keyword=q,
            status_filter=status_value,
            sort_key=ordering,
            tag_ids=tag_ids,
        )
        videos = use_case.execute(
            user_id=request.user.id,
            input=input_dto,
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

        use_case = self.resolve_dependency(self.create_video_use_case)
        try:
            data = serializer.validated_data
            upload_file = data["file"]
            input_dto = CreateVideoInput(
                file=upload_file,
                title=data["title"],
                description=data["description"],
                file_size=upload_file.size,
            )
            video = use_case.execute(request.user.id, input_dto)
        except FileSizeExceeded as e:
            return create_error_response(
                str(e),
                status.HTTP_400_BAD_REQUEST,
                code="FILE_TOO_LARGE",
                params={"max_size_mb": e.limit_mb},
            )
        except StorageLimitExceeded as e:
            return create_error_response(
                str(e),
                status.HTTP_400_BAD_REQUEST,
                code="STORAGE_LIMIT_EXCEEDED",
            )

        ctx = {"request": request}
        return Response(
            VideoSerializer(video, context=ctx).data,
            status=status.HTTP_201_CREATED,
        )


class YoutubeVideoCreateView(DependencyResolverMixin, AuthenticatedViewMixin, generics.GenericAPIView):
    serializer_class = YoutubeVideoCreateSerializer
    create_youtube_video_use_case = None

    @extend_schema(
        request=YoutubeVideoCreateSerializer,
        responses={201: VideoSerializer},
        summary="Create YouTube video",
        description="Register a YouTube URL and create a video resource.",
    )
    def post(self, request, *args, **kwargs):
        serializer = YoutubeVideoCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = self.resolve_dependency(self.create_youtube_video_use_case)
        data = serializer.validated_data
        video = use_case.execute(
            request.user.id,
            CreateYoutubeVideoInput(
                youtube_url=data["youtube_url"],
                title=data["title"],
                description=data["description"],
            ),
        )
        ctx = {"request": request}
        return Response(VideoSerializer(video, context=ctx).data, status=status.HTTP_201_CREATED)


class VideoDetailView(DependencyResolverMixin, AuthenticatedViewMixin, APIView):
    """Retrieve, update, and delete a video."""

    serializer_class = VideoSerializer
    video_detail_use_case = None
    update_video_use_case = None
    delete_video_use_case = None

    def _get_video(self, pk, user_id):
        use_case = self.resolve_dependency(self.video_detail_use_case)
        return use_case.execute(pk, user_id)

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

        use_case = self.resolve_dependency(self.update_video_use_case)
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

    @extend_schema(
        request=VideoFullUpdateSerializer,
        responses={200: VideoSerializer},
        summary="Full update video",
        description="Replace all video fields. title is required.",
    )
    def put(self, request, pk):
        video = self._get_video(pk, request.user.id)
        if video is None:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)

        serializer = VideoFullUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = self.resolve_dependency(self.update_video_use_case)
        try:
            data = serializer.validated_data
            input_dto = UpdateVideoInput(
                title=data["title"],
                description=data.get("description", ""),
            )
            updated = use_case.execute(pk, request.user.id, input_dto)
        except ResourceNotFound:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)

        ctx = {"request": request}
        return Response(VideoSerializer(updated, context=ctx).data)

    def delete(self, request, pk):
        use_case = self.resolve_dependency(self.delete_video_use_case)
        try:
            use_case.execute(pk, request.user.id)
        except ResourceNotFound:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class VideoUploadRequestView(DependencyResolverMixin, AuthenticatedViewMixin, generics.GenericAPIView):
    """Request a presigned URL for direct-to-storage video upload."""

    serializer_class = VideoUploadRequestSerializer
    request_video_upload_use_case = None

    @extend_schema(
        request=VideoUploadRequestSerializer,
        responses={201: VideoUploadRequestResponseSerializer},
        summary="Request presigned upload URL",
        description="Validate metadata, create a video record, and return a presigned PUT URL.",
    )
    def post(self, request, *args, **kwargs):
        serializer = VideoUploadRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = self.resolve_dependency(self.request_video_upload_use_case)
        try:
            data = serializer.validated_data
            input_dto = RequestUploadInput(
                filename=data["filename"],
                content_type=data["content_type"],
                file_size=data["file_size"],
                title=data["title"],
                description=data.get("description", ""),
            )
            result = use_case.execute(request.user.id, input_dto)
        except FileSizeExceeded as e:
            return create_error_response(
                str(e),
                status.HTTP_400_BAD_REQUEST,
                code="FILE_TOO_LARGE",
                params={"max_size_mb": e.limit_mb},
            )
        except StorageLimitExceeded as e:
            return create_error_response(
                str(e),
                status.HTTP_400_BAD_REQUEST,
                code="STORAGE_LIMIT_EXCEEDED",
            )
        except ValueError as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)

        ctx = {"request": request}
        return Response(
            {
                "video": VideoSerializer(result.video, context=ctx).data,
                "upload_url": result.upload_url,
            },
            status=status.HTTP_201_CREATED,
        )


class VideoUploadConfirmView(DependencyResolverMixin, AuthenticatedViewMixin, APIView):
    """Confirm that a presigned-URL upload has completed."""

    confirm_video_upload_use_case = None

    @extend_schema(
        responses={200: VideoSerializer},
        summary="Confirm video upload",
        description="Transition video from uploading to pending and dispatch transcription.",
    )
    def post(self, request, pk):
        use_case = self.resolve_dependency(self.confirm_video_upload_use_case)
        try:
            video = use_case.execute(pk, request.user.id)
        except ResourceNotFound:
            return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)
        except InvalidUploadState as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)

        ctx = {"request": request}
        return Response(VideoSerializer(video, context=ctx).data)


# ---------------------------------------------------------------------------
# Video group views
# ---------------------------------------------------------------------------


class VideoGroupListView(DependencyResolverMixin, AuthenticatedViewMixin, generics.GenericAPIView):
    """List and create video groups."""

    serializer_class = VideoGroupListSerializer
    list_groups_use_case = None
    create_group_use_case = None

    @extend_schema(
        responses={200: VideoGroupListSerializer(many=True)},
        summary="List video groups",
        description="Return all video groups for the current user.",
    )
    def get(self, request, *args, **kwargs):
        use_case = self.resolve_dependency(self.list_groups_use_case)
        groups = use_case.execute(user_id=request.user.id, include_videos=False)
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

        use_case = self.resolve_dependency(self.create_group_use_case)
        input_dto = CreateGroupInput(**serializer.validated_data)
        group = use_case.execute(request.user.id, input_dto)

        ctx = {"request": request}
        return Response(
            VideoGroupDetailSerializer(group, context=ctx).data,
            status=status.HTTP_201_CREATED,
        )


class VideoGroupDetailView(DependencyResolverMixin, AuthenticatedViewMixin, APIView):
    """Retrieve, update, and delete a video group."""

    serializer_class = VideoGroupDetailSerializer
    video_group_use_case = None
    update_group_use_case = None
    delete_group_use_case = None

    @extend_schema(
        responses={200: VideoGroupDetailSerializer},
        summary="Get video group",
        description="Return a video group by ID.",
    )
    def get(self, request, pk):
        use_case = self.resolve_dependency(self.video_group_use_case)
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

        use_case = self.resolve_dependency(self.update_group_use_case)
        try:
            data = serializer.validated_data
            input_dto = UpdateGroupInput(
                name=data.get("name"),
                description=data.get("description"),
            )
            group = use_case.execute(pk, request.user.id, input_dto)
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)

        ctx = {"request": request}
        return Response(VideoGroupDetailSerializer(group, context=ctx).data)

    @extend_schema(
        request=VideoGroupFullUpdateSerializer,
        responses={200: VideoGroupDetailSerializer},
        summary="Full update video group",
        description="Replace all video group fields. name is required.",
    )
    def put(self, request, pk):
        serializer = VideoGroupFullUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = self.resolve_dependency(self.update_group_use_case)
        try:
            data = serializer.validated_data
            input_dto = UpdateGroupInput(
                name=data["name"],
                description=data.get("description", ""),
            )
            group = use_case.execute(pk, request.user.id, input_dto)
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)

        ctx = {"request": request}
        return Response(VideoGroupDetailSerializer(group, context=ctx).data)

    def delete(self, request, pk):
        use_case = self.resolve_dependency(self.delete_group_use_case)
        try:
            use_case.execute(pk, request.user.id)
        except ResourceNotFound:
            return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AddVideoToGroupView(DependencyResolverMixin, AuthenticatedViewMixin, APIView):
    """Add or remove a single video from a group."""

    serializer_class = AddVideoToGroupResponseSerializer
    add_video_to_group_use_case = None
    remove_video_from_group_use_case = None

    @extend_schema(
        responses={201: AddVideoToGroupResponseSerializer},
        summary="Add video to group",
        description="Add a single video to a group.",
        operation_id="video_groups_add_single_video",
    )
    def post(self, request, group_id, video_id):
        use_case = self.resolve_dependency(self.add_video_to_group_use_case)
        try:
            member = use_case.execute(group_id, video_id, request.user.id)
        except ResourceNotFound as e:
            return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)
        except VideoAlreadyInGroup:
            return create_error_response(
                "This video is already added to the group",
                status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"message": "Video added to group", "id": member.id},
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        responses={200: VideoActionMessageResponseSerializer},
        summary="Remove video from group",
        description="Remove a video from a group.",
    )
    def delete(self, request, group_id, video_id):
        use_case = self.resolve_dependency(self.remove_video_from_group_use_case)
        try:
            use_case.execute(group_id, video_id, request.user.id)
        except ResourceNotFound as e:
            return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)
        except VideoNotInGroup:
            return create_error_response(
                "This video is not added to the group", status.HTTP_404_NOT_FOUND
            )

        return Response({"message": "Video removed from group"}, status=status.HTTP_200_OK)


@extend_schema(
    request=AddVideosToGroupRequestSerializer,
    responses={201: AddVideosToGroupResponseSerializer},
    summary="Add multiple videos to group",
    description="Add multiple videos to a group. Videos already in the group will be skipped.",
    operation_id="video_groups_add_multiple_videos",
)
@authenticated_view_with_error_handling(["POST"])
def add_videos_to_group(
    request,
    group_id,
    add_videos_to_group_use_case,
):
    """Add multiple videos to group."""
    video_ids = request.data.get("video_ids", [])
    if not video_ids:
        return create_error_response("Video ID not specified", status.HTTP_400_BAD_REQUEST)

    use_case = DependencyResolverMixin.resolve_dependency(add_videos_to_group_use_case)
    try:
        added_count, skipped_count = use_case.execute(group_id, video_ids, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)

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
def remove_video_from_group(
    request,
    group_id,
    video_id,
    remove_video_from_group_use_case,
):
    """Remove video from group."""
    use_case = DependencyResolverMixin.resolve_dependency(remove_video_from_group_use_case)
    try:
        use_case.execute(group_id, video_id, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)
    except VideoNotInGroup:
        return create_error_response("This video is not added to the group", status.HTTP_404_NOT_FOUND)

    return Response({"message": "Video removed from group"}, status=status.HTTP_200_OK)


@extend_schema(
    request=ReorderVideosRequestSerializer,
    responses={200: VideoActionMessageResponseSerializer},
    summary="Reorder videos in group",
    description="Update the order of videos in a group by providing video IDs in the desired order.",
)
@authenticated_view_with_error_handling(["PATCH"])
def reorder_videos_in_group(
    request,
    group_id,
    reorder_videos_use_case,
):
    """Update video order in group."""
    video_ids = request.data.get("video_ids", [])
    if not isinstance(video_ids, list):
        return create_error_response("video_ids must be an array", status.HTTP_400_BAD_REQUEST)

    use_case = DependencyResolverMixin.resolve_dependency(reorder_videos_use_case)
    try:
        use_case.execute(group_id, video_ids, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)
    except GroupVideoOrderMismatch:
        return create_error_response(
            "Specified video IDs do not match videos in group",
            status.HTTP_400_BAD_REQUEST,
        )

    return Response({"message": "Video order updated"}, status=status.HTTP_200_OK)


class CreateShareLinkView(DependencyResolverMixin, AuthenticatedViewMixin, APIView):
    """Manage share link for a group (create and delete)."""

    serializer_class = ShareLinkResponseSerializer
    create_share_link_use_case = None
    delete_share_link_use_case = None

    @extend_schema(
        request=ShareLinkRequestSerializer,
        responses={201: ShareLinkResponseSerializer},
        summary="Create share link",
        description="Create or update a share slug for a group.",
    )
    def post(self, request, group_id):
        serializer = ShareLinkRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        use_case = self.resolve_dependency(self.create_share_link_use_case)
        try:
            share_slug = use_case.execute(
                group_id,
                request.user.id,
                serializer.validated_data["share_slug"],
            )
        except ResourceNotFound as e:
            return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)
        except InvalidShareSlugInput as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except ShareSlugAlreadyExists as e:
            return create_error_response(
                str(e), status.HTTP_409_CONFLICT, code="CONFLICT"
            )

        return Response(
            {"message": "Share link saved", "share_slug": share_slug},
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        responses={200: VideoActionMessageResponseSerializer},
        summary="Delete share link",
        description="Disable the current share link for a group.",
    )
    def delete(self, request, group_id):
        use_case = self.resolve_dependency(self.delete_share_link_use_case)
        try:
            use_case.execute(group_id, request.user.id)
        except ResourceNotFound as e:
            return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)
        except Exception:
            logger.exception("Unhandled exception in CreateShareLinkView.delete")
            return create_error_response("", status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"message": "Share link disabled"}, status=status.HTTP_200_OK)


@extend_schema(
    responses={200: VideoGroupDetailSerializer},
    summary="Get shared group",
    description="Return a publicly shared group by share slug.",
)
@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([ShareTokenIPThrottle])
def get_shared_group(
    request,
    share_slug,
    shared_group_use_case,
):
    """Get group by share slug (no authentication required)."""
    use_case = DependencyResolverMixin.resolve_dependency(shared_group_use_case)
    try:
        group = use_case.execute(share_slug)
    except ResourceNotFound:
        return create_error_response("Share link not found", status.HTTP_404_NOT_FOUND)

    ctx = {"request": request}
    return Response(VideoGroupDetailSerializer(group, context=ctx).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Tag views
# ---------------------------------------------------------------------------


class TagListView(DependencyResolverMixin, AuthenticatedViewMixin, generics.GenericAPIView):
    """List and create tags."""

    serializer_class = TagListSerializer
    list_tags_use_case = None
    create_tag_use_case = None

    @extend_schema(
        responses={200: TagListSerializer(many=True)},
        summary="List tags",
        description="Return all tags for the current user.",
        operation_id="tags_list",
    )
    def get(self, request, *args, **kwargs):
        use_case = self.resolve_dependency(self.list_tags_use_case)
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

        use_case = self.resolve_dependency(self.create_tag_use_case)
        input_dto = CreateTagInput(**serializer.validated_data)
        try:
            tag = use_case.execute(request.user.id, input_dto)
        except InvalidTagInput as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return Response(TagListSerializer(tag).data, status=status.HTTP_201_CREATED)


class TagDetailView(DependencyResolverMixin, AuthenticatedViewMixin, APIView):
    """Retrieve, update, and delete a tag."""

    serializer_class = TagDetailSerializer
    tag_detail_use_case = None
    update_tag_use_case = None
    delete_tag_use_case = None

    @extend_schema(
        responses={200: TagDetailSerializer},
        summary="Get tag detail",
        description="Return a tag with its associated videos.",
    )
    def get(self, request, pk):
        use_case = self.resolve_dependency(self.tag_detail_use_case)
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

        use_case = self.resolve_dependency(self.update_tag_use_case)
        try:
            data = serializer.validated_data
            input_dto = UpdateTagInput(
                name=data.get("name"),
                color=data.get("color"),
            )
            tag = use_case.execute(pk, request.user.id, input_dto)
        except InvalidTagInput as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except ResourceNotFound:
            return create_error_response("Tag not found", status.HTTP_404_NOT_FOUND)

        ctx = {"request": request}
        return Response(TagDetailSerializer(tag, context=ctx).data)

    @extend_schema(
        request=TagFullUpdateSerializer,
        responses={200: TagDetailSerializer},
        summary="Full update tag",
        description="Replace all tag fields. name and color are required.",
    )
    def put(self, request, pk):
        serializer = TagFullUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        use_case = self.resolve_dependency(self.update_tag_use_case)
        try:
            data = serializer.validated_data
            input_dto = UpdateTagInput(
                name=data["name"],
                color=data["color"],
            )
            tag = use_case.execute(pk, request.user.id, input_dto)
        except InvalidTagInput as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except ResourceNotFound:
            return create_error_response("Tag not found", status.HTTP_404_NOT_FOUND)

        ctx = {"request": request}
        return Response(TagDetailSerializer(tag, context=ctx).data)

    def delete(self, request, pk):
        use_case = self.resolve_dependency(self.delete_tag_use_case)
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
def add_tags_to_video(
    request,
    video_id,
    add_tags_to_video_use_case,
):
    """Add multiple tags to video."""
    tag_ids = request.data.get("tag_ids", [])
    if not tag_ids:
        return create_error_response("Tag IDs not specified", status.HTTP_400_BAD_REQUEST)

    use_case = DependencyResolverMixin.resolve_dependency(add_tags_to_video_use_case)
    try:
        added_count, skipped_count = use_case.execute(video_id, tag_ids, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)

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
def remove_tag_from_video(
    request,
    video_id,
    tag_id,
    remove_tag_from_video_use_case,
):
    """Remove tag from video."""
    use_case = DependencyResolverMixin.resolve_dependency(remove_tag_from_video_use_case)
    try:
        use_case.execute(video_id, tag_id, request.user.id)
    except ResourceNotFound as e:
        return create_error_response(_not_found_message(e), status.HTTP_404_NOT_FOUND)

    return Response({"message": "Tag removed from video"}, status=status.HTTP_200_OK)
