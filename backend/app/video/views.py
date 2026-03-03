from django.db import transaction
from django.db.models import Prefetch
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.responses import create_error_response
from app.models import Tag, VideoTag
from app.utils.decorators import authenticated_view_with_error_handling
from app.utils.mixins import AuthenticatedViewMixin, DynamicSerializerMixin
from app.video.factories import (add_tags_to_video_use_case,
                                 add_video_to_group_use_case,
                                 add_videos_to_group_use_case,
                                 create_share_link_use_case,
                                 create_tag_use_case,
                                 create_video_group_use_case,
                                 delete_share_link_use_case,
                                 delete_tag_use_case,
                                 delete_video_group_use_case,
                                 delete_video_use_case,
                                 get_shared_group_use_case,
                                 list_video_groups_use_case,
                                 list_videos_use_case,
                                 remove_tag_from_video_use_case,
                                 remove_video_from_group_use_case,
                                 reorder_videos_in_group_use_case,
                                 update_tag_use_case,
                                 update_video_group_use_case,
                                 update_video_use_case, upload_video_use_case)
from app.video.use_cases import (AddTagsToVideoCommand,
                                 AddVideosToGroupCommand,
                                 AddVideoToGroupCommand,
                                 CreateShareLinkCommand, CreateTagCommand,
                                 CreateVideoGroupCommand,
                                 DeleteShareLinkCommand, DeleteTagCommand,
                                 DeleteVideoCommand, DeleteVideoGroupCommand,
                                 GetSharedGroupQuery, ListVideoGroupsQuery,
                                 ListVideosQuery, RemoveTagFromVideoCommand,
                                 RemoveVideoFromGroupCommand,
                                 ReorderVideosInGroupCommand, UpdateTagCommand,
                                 UpdateVideoCommand, UpdateVideoGroupCommand,
                                 UploadVideoCommand)

from .serializers import (AddTagsToVideoRequestSerializer,
                          AddTagsToVideoResponseSerializer,
                          AddVideosToGroupRequestSerializer,
                          AddVideosToGroupResponseSerializer,
                          AddVideoToGroupResponseSerializer,
                          ReorderVideosRequestSerializer,
                          ShareLinkResponseSerializer, TagCreateSerializer,
                          TagDetailSerializer, TagListSerializer,
                          TagUpdateSerializer,
                          VideoActionMessageResponseSerializer,
                          VideoCreateSerializer, VideoGroupCreateSerializer,
                          VideoGroupDetailSerializer, VideoGroupListSerializer,
                          VideoGroupUpdateSerializer, VideoListSerializer,
                          VideoSerializer, VideoUpdateSerializer)


class BaseVideoView(AuthenticatedViewMixin):
    """Common base Video view class"""

    def get_queryset(self):
        """Common logic to return only current user's Videos via UseCase."""
        return list_videos_use_case().execute(
            ListVideosQuery(
                user_id=self.request.user.id,
                include_transcript=self.should_include_transcript(),
                include_groups=self.should_include_groups(),
            )
        )

    def should_include_groups(self):
        return False

    def should_include_transcript(self):
        return False


class VideoListView(DynamicSerializerMixin, BaseVideoView, generics.ListCreateAPIView):
    """Video list retrieval and creation view"""

    serializer_map = {
        "GET": VideoListSerializer,
        "POST": VideoCreateSerializer,
    }

    def _parse_tag_ids(self):
        raw = self.request.query_params.get("tags", "").strip()
        if not raw:
            return None
        try:
            return [int(tid) for tid in raw.split(",") if tid]
        except ValueError:
            return None

    def get_queryset(self):
        return list_videos_use_case().execute(
            ListVideosQuery(
                user_id=self.request.user.id,
                include_transcript=self.should_include_transcript(),
                include_groups=self.should_include_groups(),
                q=self.request.query_params.get("q", "").strip(),
                status=self.request.query_params.get("status", "").strip(),
                tag_ids=self._parse_tag_ids(),
                ordering=self.request.query_params.get("ordering", "").strip(),
            )
        )

    @extend_schema(
        request=VideoCreateSerializer,
        responses={201: VideoSerializer},
        summary="Upload video",
        description="Upload a video and return the created video resource.",
    )
    def create(self, request, *args, **kwargs):
        """Return a full video representation after upload."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = upload_video_use_case().execute(
                UploadVideoCommand(
                    actor_id=request.user.id,
                    validated_data=serializer.validated_data,
                ),
            )
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        instance = self.get_queryset().get(pk=result.video_id)

        output_serializer = VideoSerializer(
            instance,
            context=self.get_serializer_context(),
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
    """Video detail, update, and delete view"""

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
    @transaction.atomic
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)

        try:
            update_video_use_case().execute(
                UpdateVideoCommand(
                    actor_id=request.user.id,
                    video_id=instance.id,
                    validated_data=serializer.validated_data,
                )
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)

        instance.refresh_from_db()
        return Response(
            VideoSerializer(instance, context=self.get_serializer_context()).data
        )

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            delete_video_use_case().execute(
                DeleteVideoCommand(
                    actor_id=request.user.id,
                    video_id=instance.id,
                )
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BaseVideoGroupView(AuthenticatedViewMixin):
    """Common base VideoGroup view class"""

    def _get_filtered_queryset(self, annotate_only=False):
        """Common query retrieval logic via UseCase."""
        return list_video_groups_use_case().execute(
            ListVideoGroupsQuery(
                user_id=self.request.user.id,
                include_videos=not annotate_only,
                annotate_video_count=True,
            )
        )


class VideoGroupListView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.ListCreateAPIView
):
    """VideoGroup list retrieval and creation view"""

    serializer_map = {
        "GET": VideoGroupListSerializer,
        "POST": VideoGroupCreateSerializer,
    }

    def get_queryset(self):
        """Return only current user's VideoGroups"""
        return self._get_filtered_queryset(annotate_only=True)

    @extend_schema(
        request=VideoGroupCreateSerializer,
        responses={201: VideoGroupDetailSerializer},
        summary="Create video group",
        description="Create a video group and return the created group resource.",
    )
    def create(self, request, *args, **kwargs):
        """Return a full group representation after creation."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        group = create_video_group_use_case().execute(
            CreateVideoGroupCommand(
                actor_id=request.user.id,
                validated_data=serializer.validated_data,
            )
        )

        instance = self._get_filtered_queryset(annotate_only=False).get(pk=group.pk)
        output_serializer = VideoGroupDetailSerializer(
            instance,
            context=self.get_serializer_context(),
        )
        headers = self.get_success_headers(output_serializer.data)
        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )


class VideoGroupDetailView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.RetrieveUpdateDestroyAPIView
):
    """VideoGroup detail, update, and delete view"""

    serializer_map = {
        "GET": VideoGroupDetailSerializer,
        "PUT": VideoGroupUpdateSerializer,
        "PATCH": VideoGroupUpdateSerializer,
    }

    def get_queryset(self):
        """Return only current user's VideoGroups"""
        return self._get_filtered_queryset(annotate_only=False)

    @extend_schema(
        request=VideoGroupUpdateSerializer,
        responses={200: VideoGroupDetailSerializer},
        summary="Update video group",
        description="Update a video group and return the updated group resource.",
    )
    def update(self, request, *args, **kwargs):
        """Return a detailed group representation after update."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)

        try:
            update_video_group_use_case().execute(
                UpdateVideoGroupCommand(
                    actor_id=request.user.id,
                    group_id=instance.id,
                    validated_data=serializer.validated_data,
                )
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)

        instance = self.get_queryset().get(pk=instance.pk)
        return Response(
            VideoGroupDetailSerializer(
                instance,
                context=self.get_serializer_context(),
            ).data
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            delete_video_group_use_case().execute(
                DeleteVideoGroupCommand(
                    actor_id=request.user.id,
                    group_id=instance.id,
                )
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
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
        try:
            result = add_video_to_group_use_case().execute(
                AddVideoToGroupCommand(
                    actor_id=request.user.id,
                    group_id=group_id,
                    video_id=video_id,
                )
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)

        return Response(
            {"message": "Video added to group", "id": result.member_id},
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
    """Add multiple videos to group"""
    try:
        result = add_videos_to_group_use_case().execute(
            AddVideosToGroupCommand(
                actor_id=request.user.id,
                group_id=group_id,
                video_ids=request.data.get("video_ids", []),
            )
        )
    except LookupError as exc:
        return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
    except ValueError as exc:
        return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            "message": f"Added {result.added_count} videos to group",
            "added_count": result.added_count,
            "skipped_count": result.skipped_count,
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
    """Remove video from group"""
    try:
        remove_video_from_group_use_case().execute(
            RemoveVideoFromGroupCommand(
                actor_id=request.user.id,
                group_id=group_id,
                video_id=video_id,
            )
        )
    except LookupError as exc:
        return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
    return Response({"message": "Video removed from group"}, status=status.HTTP_200_OK)


@extend_schema(
    request=ReorderVideosRequestSerializer,
    responses={200: VideoActionMessageResponseSerializer},
    summary="Reorder videos in group",
    description="Update the order of videos in a group by providing video IDs in the desired order.",
)
@authenticated_view_with_error_handling(["PATCH"])
@transaction.atomic
def reorder_videos_in_group(request, group_id):
    """Update video order in group"""
    try:
        video_ids = request.data.get("video_ids", [])
        if not isinstance(video_ids, list):
            return create_error_response(
                "video_ids must be an array", status.HTTP_400_BAD_REQUEST
            )
    except Exception:
        return create_error_response(
            "Failed to parse request body", status.HTTP_400_BAD_REQUEST
        )

    try:
        reorder_videos_in_group_use_case().execute(
            ReorderVideosInGroupCommand(
                actor_id=request.user.id,
                group_id=group_id,
                video_ids=video_ids,
            )
        )
    except LookupError as exc:
        return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
    except ValueError as exc:
        return create_error_response(
            str(exc),
            status.HTTP_400_BAD_REQUEST,
        )
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
        try:
            result = create_share_link_use_case().execute(
                CreateShareLinkCommand(actor_id=request.user.id, group_id=group_id)
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)

        return Response(
            {
                "message": "Share link generated",
                "share_token": result.share_token,
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    responses={200: VideoActionMessageResponseSerializer},
    summary="Delete share link",
    description="Disable the current share link for a group.",
)
@authenticated_view_with_error_handling(["DELETE"])
def delete_share_link(request, group_id):
    """Disable share link for group"""
    try:
        delete_share_link_use_case().execute(
            DeleteShareLinkCommand(actor_id=request.user.id, group_id=group_id)
        )
    except LookupError as exc:
        return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
    return Response({"message": "Share link disabled"}, status=status.HTTP_200_OK)


@extend_schema(
    responses={200: VideoGroupDetailSerializer},
    summary="Get shared group",
    description="Return a publicly shared group by share token.",
)
@api_view(["GET"])
@permission_classes([AllowAny])
def get_shared_group(request, share_token):
    """Get group by share token (no authentication required)"""
    try:
        group = get_shared_group_use_case().execute(
            GetSharedGroupQuery(share_token=share_token)
        )
    except LookupError as exc:
        return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)

    serializer = VideoGroupDetailSerializer(group)
    return Response(serializer.data, status=status.HTTP_200_OK)


# ====================
# Tag Views
# ====================


class BaseTagView(AuthenticatedViewMixin):
    """Common base view for Tag operations"""

    def get_queryset(self):
        from django.db.models import Count

        return Tag.objects.filter(user=self.request.user).annotate(
            video_count=Count("video_tags")
        )


class TagListView(DynamicSerializerMixin, BaseTagView, generics.ListCreateAPIView):
    """Tag list retrieval and creation view"""

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
        """Return tag metadata after creation."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tag = create_tag_use_case().execute(
            CreateTagCommand(
                actor_id=request.user.id,
                validated_data=serializer.validated_data,
            )
        )

        instance = self.get_queryset().get(pk=tag.pk)
        output_serializer = TagListSerializer(
            instance,
            context=self.get_serializer_context(),
        )
        headers = self.get_success_headers(output_serializer.data)
        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )


class TagDetailView(
    DynamicSerializerMixin, BaseTagView, generics.RetrieveUpdateDestroyAPIView
):
    """Tag detail, update, and delete view"""

    serializer_map = {
        "GET": TagDetailSerializer,
        "PUT": TagUpdateSerializer,
        "PATCH": TagUpdateSerializer,
    }

    def get_queryset(self):
        from django.db.models import Count

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
        """Return a detailed tag representation after update."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)

        try:
            update_tag_use_case().execute(
                UpdateTagCommand(
                    actor_id=request.user.id,
                    tag_id=instance.id,
                    validated_data=serializer.validated_data,
                )
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)

        instance = self.get_queryset().get(pk=instance.pk)
        return Response(
            TagDetailSerializer(
                instance,
                context=self.get_serializer_context(),
            ).data
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            delete_tag_use_case().execute(
                DeleteTagCommand(
                    actor_id=request.user.id,
                    tag_id=instance.id,
                )
            )
        except LookupError as exc:
            return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    request=AddTagsToVideoRequestSerializer,
    responses={201: AddTagsToVideoResponseSerializer},
    operation_id="videos_add_tags",
)
@authenticated_view_with_error_handling(["POST"])
@transaction.atomic
def add_tags_to_video(request, video_id):
    """Add multiple tags to video"""
    try:
        result = add_tags_to_video_use_case().execute(
            AddTagsToVideoCommand(
                actor_id=request.user.id,
                video_id=video_id,
                tag_ids=request.data.get("tag_ids", []),
            )
        )
    except LookupError as exc:
        return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
    except ValueError as exc:
        return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)

    return Response(
        {
            "message": f"Added {result.added_count} tags to video",
            "added_count": result.added_count,
            "skipped_count": result.skipped_count,
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
    """Remove tag from video"""
    try:
        remove_tag_from_video_use_case().execute(
            RemoveTagFromVideoCommand(
                actor_id=request.user.id,
                video_id=video_id,
                tag_id=tag_id,
            )
        )
    except LookupError as exc:
        return create_error_response(str(exc), status.HTTP_404_NOT_FOUND)
    return Response({"message": "Tag removed from video"}, status=status.HTTP_200_OK)
