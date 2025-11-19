import logging
import secrets

from django.db.models import Max, Q
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from app.common.responses import create_error_response
from app.models import Video, VideoGroup, VideoGroupMember
from app.utils.decorators import authenticated_view_with_error_handling
from app.utils.mixins import AuthenticatedViewMixin, DynamicSerializerMixin
from app.utils.query_optimizer import QueryOptimizer

from .serializers import (AddVideosToGroupRequestSerializer,
                          AddVideosToGroupResponseSerializer,
                          MessageResponseSerializer,
                          ReorderVideosRequestSerializer,
                          VideoCreateSerializer, VideoGroupCreateSerializer,
                          VideoGroupDetailSerializer, VideoGroupListSerializer,
                          VideoGroupUpdateSerializer, VideoListSerializer,
                          VideoSerializer, VideoUpdateSerializer)

logger = logging.getLogger(__name__)


class BaseVideoView(AuthenticatedViewMixin):
    """Common base Video view class"""

    def get_queryset(self):
        """Common logic to return only current user's Videos"""
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
    """Video list retrieval and creation view

    N+1 prevention:
    - select_related not needed since VideoListSerializer doesn't include user
    - Can override get_queryset() if additional related data is needed in the future
    """

    serializer_map = {
        "GET": VideoListSerializer,
        "POST": VideoCreateSerializer,
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        q = self.request.query_params.get("q", "").strip()
        status_value = self.request.query_params.get("status", "").strip()
        ordering = self.request.query_params.get("ordering", "").strip()

        if q:
            queryset = queryset.filter(
                Q(title__icontains=q) | Q(description__icontains=q)
            )

        if status_value:
            queryset = queryset.filter(status=status_value)

        ordering_map = {
            "uploaded_at_desc": "-uploaded_at",
            "uploaded_at_asc": "uploaded_at",
            "title_asc": "title",
            "title_desc": "-title",
        }
        if ordering in ordering_map:
            queryset = queryset.order_by(ordering_map[ordering])

        return queryset


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

    def update(self, request, *args, **kwargs):
        """Update PGVector metadata when Video is updated"""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        # Save title before update
        old_title = instance.title

        # Execute normal update process
        response = super().update(request, *args, partial=partial, **kwargs)

        # Refresh instance to get latest data
        instance.refresh_from_db()

        # Update PGVector metadata if title has changed
        if old_title != instance.title:
            self._update_video_title_in_pgvector(instance.id, instance.title)

        return response

    def _update_video_title_in_pgvector(self, video_id, new_title):
        """Update video_title in PGVector metadata"""
        from app.utils.vector_manager import update_video_title_in_vectors

        update_video_title_in_vectors(video_id, new_title)

    def destroy(self, request, *args, **kwargs):
        """Delete file and vector data when Video is deleted"""
        instance = self.get_object()
        video_id = instance.id

        # Delete file if it exists (skip for YouTube URLs)
        if instance.file and not instance.youtube_url:
            instance.file.delete(save=False)

        from app.utils.vector_manager import delete_video_vectors

        try:
            delete_video_vectors(video_id)
        except Exception as e:
            logger.warning(f"Failed to delete vectors for video {video_id}: {e}")

        return super().destroy(request, *args, **kwargs)


class BaseVideoGroupView(AuthenticatedViewMixin):
    """Common base VideoGroup view class"""

    def _get_filtered_queryset(self, annotate_only=False):
        """Common query retrieval logic"""
        return QueryOptimizer.get_video_groups_with_videos(
            user_id=self.request.user.id,
            include_videos=not annotate_only,
            annotate_video_count=True,
        )


class VideoGroupListView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.ListCreateAPIView
):
    """VideoGroup list retrieval and creation view (N+1 prevention)"""

    serializer_map = {
        "GET": VideoGroupListSerializer,
        "POST": VideoGroupCreateSerializer,
    }

    def get_queryset(self):
        """Return only current user's VideoGroups (N+1 prevention)"""
        return self._get_filtered_queryset(annotate_only=True)


class VideoGroupDetailView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.RetrieveUpdateDestroyAPIView
):
    """VideoGroup detail, update, and delete view (N+1 prevention)"""

    serializer_map = {
        "GET": VideoGroupDetailSerializer,
        "PUT": VideoGroupUpdateSerializer,
        "PATCH": VideoGroupUpdateSerializer,
    }

    def get_queryset(self):
        """Return only current user's VideoGroups (N+1 prevention)"""
        return self._get_filtered_queryset(annotate_only=False)


def _handle_validation_error(value, entity_name: str):
    """Common validation check"""
    if not value:
        return create_error_response(
            f"{entity_name} not found", status.HTTP_404_NOT_FOUND
        )
    return None


def _validate_and_get_resource(
    user, model_class, resource_id, entity_name: str, select_related_fields=None
):
    """Common resource retrieval and validation logic"""
    # N+1 prevention: Use filter().first() to return None (don't raise exception)
    # Ownership check is automatic since we filter by user
    queryset = model_class.objects.filter(user=user, id=resource_id)

    # N+1 prevention: Add select_related if needed
    if select_related_fields:
        queryset = queryset.select_related(*select_related_fields)

    resource = queryset.first()

    # Resource not found (doesn't exist or user doesn't own it)
    error = _handle_validation_error(resource, entity_name)
    if error:
        return None, error

    return resource, None


def _get_group_and_video(user, group_id, video_id, select_related_fields=None):
    """Common group and video retrieval logic"""
    # N+1 prevention: Apply select_related if needed
    group, error = _validate_and_get_resource(
        user, VideoGroup, group_id, "Group", select_related_fields
    )
    if error:
        return None, None, error

    video, error = _validate_and_get_resource(
        user, Video, video_id, "Video", select_related_fields
    )
    if error:
        return None, None, error

    return group, video, None


def _validate_video_ids(request, entity_name: str):
    """Validate video_ids"""
    video_ids = request.data.get("video_ids", [])
    if not video_ids:
        return None, create_error_response(
            f"{entity_name} ID not specified", status.HTTP_400_BAD_REQUEST
        )
    return video_ids, None


def _validate_videos_count(videos, video_ids):
    """Check video count"""
    if len(videos) != len(video_ids):
        return create_error_response("Some videos not found", status.HTTP_404_NOT_FOUND)
    return None


def _handle_group_video_operation(
    request,
    group_id,
    video_id,
    operation_func,
    success_message,
    success_status=status.HTTP_200_OK,
):
    """
    Common handler for group and video operations

    Args:
        request: HTTP request
        group_id: Group ID
        video_id: Video ID
        operation_func: Function to execute the operation
        success_message: Success message
        success_status: Success status code

    Returns:
        Response: Operation result
    """
    group, video, error = _get_group_and_video(request.user, group_id, video_id)

    if error:
        return error

    # Execute operation
    result = operation_func(group, video)
    if isinstance(result, Response):
        return result

    return Response(
        {"message": success_message},
        status=success_status,
    )


def _get_member_queryset(group, video=None, select_related=False):
    """Common member query"""
    queryset = VideoGroupMember.objects.filter(group=group)
    if video:
        queryset = queryset.filter(video=video)

    # N+1 prevention: Apply select_related only when video or group data is needed
    if select_related:
        queryset = queryset.select_related("video", "group")

    return queryset


def _member_exists(group, video):
    """Check if member exists"""
    return _get_member_queryset(group, video).exists()


def _check_and_get_member(
    group, video, error_message, status_code=status.HTTP_404_NOT_FOUND
):
    """Check member existence and retrieve"""
    member = _get_member_queryset(group, video).first()
    if not member:
        return None, create_error_response(error_message, status_code)
    return member, None


# Common decorators are already imported from app.utils.decorators


def _add_video_to_group_operation(group, video):
    """Operation to add video to group"""
    # Check if already added
    member = _get_member_queryset(group, video).first()
    if member:
        return create_error_response(
            "This video is already added to the group", status.HTTP_400_BAD_REQUEST
        )

    # Assign order to place at the end of the group
    max_order = (
        _get_member_queryset(group).aggregate(max_order=Max("order")).get("max_order")
    )
    next_order = (max_order if max_order is not None else -1) + 1

    member = VideoGroupMember.objects.create(
        group=group,
        video=video,
        order=next_order,
    )
    return Response(
        {"message": "Video added to group", "id": member.id},
        status=status.HTTP_201_CREATED,
    )


@authenticated_view_with_error_handling(["POST"])
def add_video_to_group(request, group_id, video_id):
    """Add video to group"""
    return _handle_group_video_operation(
        request,
        group_id,
        video_id,
        _add_video_to_group_operation,
        "Video added to group",
        status.HTTP_201_CREATED,
    )


@extend_schema(
    request=AddVideosToGroupRequestSerializer,
    responses={201: AddVideosToGroupResponseSerializer},
    summary="Add multiple videos to group",
    description="Add multiple videos to a group. Videos already in the group will be skipped.",
)
@authenticated_view_with_error_handling(["POST"])
def add_videos_to_group(request, group_id):
    """Add multiple videos to group"""
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "Group"
    )
    if error:
        return error

    video_ids, error = _validate_video_ids(request, "Video")
    if error:
        return error

    # Bulk fetch videos (N+1 prevention)
    # select_related not needed here (user data already validated)
    videos = list(Video.objects.filter(user=request.user, id__in=video_ids))

    error = _validate_videos_count(videos, video_ids)
    if error:
        return error

    # Check for already added videos (N+1 prevention)
    # Bulk fetch video_ids and use Set for O(1) lookup
    video_ids_list = [v.id for v in videos]
    existing_members = set(
        _get_member_queryset(group)
        .filter(video_id__in=video_ids_list)
        .values_list("video_id", flat=True)
    )

    # Filter only addable videos in selection order (N+1 prevention)
    video_map = {video.id: video for video in videos}
    videos_to_add = [
        video_map[video_id]
        for video_id in video_ids
        if video_id in video_map and video_id not in existing_members
    ]

    # Add in batch
    current_max_order = (
        _get_member_queryset(group).aggregate(max_order=Max("order")).get("max_order")
    )
    base_order = current_max_order if current_max_order is not None else -1
    members_to_create = [
        VideoGroupMember(
            group=group,
            video=video,
            order=base_order + index,
        )
        for index, video in enumerate(videos_to_add, start=1)
    ]
    VideoGroupMember.objects.bulk_create(members_to_create)

    added_count = len(members_to_create)
    skipped_count = len(video_ids) - added_count

    return Response(
        {
            "message": f"Added {added_count} videos to group",
            "added_count": added_count,
            "skipped_count": skipped_count,
        },
        status=status.HTTP_201_CREATED,
    )


@authenticated_view_with_error_handling(["DELETE"])
def remove_video_from_group(request, group_id, video_id):
    """Remove video from group"""
    group, video, error = _get_group_and_video(request.user, group_id, video_id)

    if error:
        return error

    # Delete group member
    member, error = _check_and_get_member(
        group, video, "This video is not added to the group"
    )
    if error:
        return error

    member.delete()

    return Response({"message": "Video removed from group"}, status=status.HTTP_200_OK)


@extend_schema(
    request=ReorderVideosRequestSerializer,
    responses={200: MessageResponseSerializer},
    summary="Reorder videos in group",
    description="Update the order of videos in a group by providing video IDs in the desired order.",
)
@authenticated_view_with_error_handling(["PATCH"])
def reorder_videos_in_group(request, group_id):
    """Update video order in group"""
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "Group"
    )
    if error:
        return error

    # Get video_ids array from request body
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

    # Get video members in group (N+1 prevention)
    # Pre-fetch video data with select_related
    # Use list() to evaluate and completely avoid N+1 problem
    members = list(VideoGroupMember.objects.filter(group=group).select_related("video"))

    # Check if specified video_ids match videos in group
    # Use Set for O(1) lookup
    group_video_ids = set(member.video_id for member in members)
    if set(video_ids) != group_video_ids:
        return create_error_response(
            "Specified video IDs do not match videos in group",
            status.HTTP_400_BAD_REQUEST,
        )

    # Update order (N+1 prevention)
    # Use bulk_update for batch update
    member_dict = {member.video_id: member for member in members}
    members_to_update = []

    for index, video_id in enumerate(video_ids):
        member = member_dict[video_id]
        member.order = index
        members_to_update.append(member)

    # Solve N+1 problem with batch update
    VideoGroupMember.objects.bulk_update(members_to_update, ["order"])

    return Response({"message": "Video order updated"}, status=status.HTTP_200_OK)


def _update_share_token(group, token_value):
    """
    Common handler to update share token

    Args:
        group: VideoGroup instance
        token_value: Token value to set (None to delete)

    Returns:
        None
    """
    group.share_token = token_value
    group.save(update_fields=["share_token"])


@authenticated_view_with_error_handling(["POST"])
def create_share_link(request, group_id):
    """Generate share link for group"""
    # Get and validate group
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "Group"
    )
    if error:
        return error

    share_token = secrets.token_urlsafe(32)
    _update_share_token(group, share_token)

    return Response(
        {
            "message": "Share link generated",
            "share_token": share_token,
        },
        status=status.HTTP_201_CREATED,
    )


@authenticated_view_with_error_handling(["DELETE"])
def delete_share_link(request, group_id):
    """Disable share link for group"""
    # Get and validate group
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "Group"
    )
    if error:
        return error

    if not group.share_token:
        return create_error_response(
            "Share link is not configured", status.HTTP_404_NOT_FOUND
        )

    _update_share_token(group, None)

    return Response(
        {"message": "Share link disabled"},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def get_shared_group(request, share_token):
    """
    Get group by share token (no authentication required)

    Public group accessible by anyone
    """
    # Get group by share_token (N+1 prevention)
    # Filter only by share_token, not by user_id
    queryset = VideoGroup.objects.filter(share_token=share_token)

    # Use QueryOptimizer to solve N+1 problem
    group = QueryOptimizer.optimize_video_group_queryset(
        queryset,
        include_videos=True,
        include_user=True,  # Required to get owner's API key information
        annotate_video_count=True,
    ).first()

    if not group:
        return create_error_response("Share link not found", status.HTTP_404_NOT_FOUND)

    # Generate response using serializer
    serializer = VideoGroupDetailSerializer(group)
    return Response(serializer.data, status=status.HTTP_200_OK)
