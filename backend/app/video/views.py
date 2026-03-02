import logging
import secrets

from django.db import transaction
from django.db.models import Max, Prefetch, Q
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from app.common.responses import create_error_response
from app.models import Tag, Video, VideoGroup, VideoGroupMember, VideoTag
from app.utils.decorators import authenticated_view_with_error_handling
from app.utils.mixins import AuthenticatedViewMixin, DynamicSerializerMixin
from app.utils.query_optimizer import QueryOptimizer

from .serializers import (AddTagsToVideoRequestSerializer,
                          AddTagsToVideoResponseSerializer,
                          AddVideoToGroupResponseSerializer,
                          AddVideosToGroupRequestSerializer,
                          AddVideosToGroupResponseSerializer,
                          ReorderVideosRequestSerializer, TagCreateSerializer,
                          ShareLinkResponseSerializer,
                          TagDetailSerializer, TagListSerializer,
                          VideoActionMessageResponseSerializer,
                          TagUpdateSerializer, VideoCreateSerializer,
                          VideoGroupCreateSerializer,
                          VideoGroupDetailSerializer, VideoGroupListSerializer,
                          VideoGroupUpdateSerializer, VideoListSerializer,
                          VideoSerializer, VideoUpdateSerializer)

logger = logging.getLogger(__name__)


class ResourceValidator:
    """Handles validation and resource retrieval logic"""

    @staticmethod
    def validate_and_get_resource(
        user, model_class, resource_id, entity_name, select_related_fields=None
    ):
        """Common resource retrieval and validation logic"""
        queryset = model_class.objects.filter(user=user, id=resource_id)

        if select_related_fields:
            queryset = queryset.select_related(*select_related_fields)

        resource = queryset.first()

        if not resource:
            return None, create_error_response(
                f"{entity_name} not found", status.HTTP_404_NOT_FOUND
            )

        return resource, None

    @staticmethod
    def get_group_and_video(user, group_id, video_id, select_related_fields=None):
        """Common group and video retrieval logic"""
        group, error = ResourceValidator.validate_and_get_resource(
            user, VideoGroup, group_id, "Group", select_related_fields
        )
        if error:
            return None, None, error

        video, error = ResourceValidator.validate_and_get_resource(
            user, Video, video_id, "Video", select_related_fields
        )
        if error:
            return None, None, error

        return group, video, None

    @staticmethod
    def validate_video_ids(request, entity_name):
        """Validate video_ids from request"""
        video_ids = request.data.get("video_ids", [])
        if not video_ids:
            return None, create_error_response(
                f"{entity_name} ID not specified", status.HTTP_400_BAD_REQUEST
            )
        return video_ids, None

    @staticmethod
    def validate_videos_count(videos, video_ids):
        """Check video count matches"""
        if len(videos) != len(video_ids):
            return create_error_response(
                "Some videos not found", status.HTTP_404_NOT_FOUND
            )
        return None


class VideoGroupMemberService:
    """Handles VideoGroupMember operations"""

    @staticmethod
    def get_member_queryset(group, video=None, select_related=False):
        """Get VideoGroupMember queryset"""
        queryset = VideoGroupMember.objects.filter(group=group)
        if video:
            queryset = queryset.filter(video=video)
        if select_related:
            queryset = queryset.select_related("video", "group")
        return queryset

    @staticmethod
    def member_exists(group, video):
        """Check if member exists"""
        return VideoGroupMemberService.get_member_queryset(group, video).exists()

    @staticmethod
    def check_and_get_member(
        group, video, error_message, status_code=status.HTTP_404_NOT_FOUND
    ):
        """Check member existence and retrieve"""
        member = VideoGroupMemberService.get_member_queryset(group, video).first()
        if not member:
            return None, create_error_response(error_message, status_code)
        return member, None

    @staticmethod
    def get_next_order(group):
        """Get next order value for new member"""
        max_order = (
            VideoGroupMemberService.get_member_queryset(group)
            .aggregate(max_order=Max("order"))
            .get("max_order")
        )
        return (max_order if max_order is not None else -1) + 1

    @staticmethod
    @transaction.atomic
    def add_video_to_group(group, video):
        """Add video to group operation"""
        if VideoGroupMemberService.get_member_queryset(group, video).first():
            return create_error_response(
                "This video is already added to the group", status.HTTP_400_BAD_REQUEST
            )

        next_order = VideoGroupMemberService.get_next_order(group)
        member = VideoGroupMember.objects.create(
            group=group, video=video, order=next_order
        )

        return Response(
            {"message": "Video added to group", "id": member.id},
            status=status.HTTP_201_CREATED,
        )


class ShareLinkService:
    """Handles share link operations"""

    @staticmethod
    def update_share_token(group, token_value):
        """Update share token for group"""
        group.share_token = token_value
        group.save(update_fields=["share_token"])


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
    """Video list retrieval and creation view"""

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

        if q:
            queryset = queryset.filter(
                Q(title__icontains=q) | Q(description__icontains=q)
            )

        if status_value:
            queryset = queryset.filter(status=status_value)

        # Filter by tags (AND condition)
        if tag_ids:
            try:
                tag_id_list = [int(tid) for tid in tag_ids.split(",") if tid]
                if tag_id_list:
                    for tag_id in tag_id_list:
                        queryset = queryset.filter(tags__id=tag_id)
            except ValueError:
                pass  # Ignore invalid tag IDs

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
        """Return a full video representation after upload."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        output_serializer = VideoSerializer(
            serializer.instance,
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
        """Update PGVector metadata when Video is updated"""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        # Save title before update
        old_title = instance.title

        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        # Refresh instance to get latest data
        instance.refresh_from_db()

        # Update PGVector metadata if title has changed
        if old_title != instance.title:
            self._update_video_title_in_pgvector(instance.id, instance.title)

        return Response(
            VideoSerializer(instance, context=self.get_serializer_context()).data
        )

    def _update_video_title_in_pgvector(self, video_id, new_title):
        """Update video_title in PGVector metadata"""
        from app.utils.vector_manager import update_video_title_in_vectors

        update_video_title_in_vectors(video_id, new_title)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        """Delete file and vector data when Video is deleted (hard delete)"""
        instance = self.get_object()

        # Hard delete: delete the video record
        # CASCADE will handle VideoGroupMember
        # post_delete signal will handle vector deletion
        instance.delete()

        # Delete file after DB deletion succeeds
        if instance.file:
            transaction.on_commit(lambda: instance.file.delete(save=False))

        return Response(status=status.HTTP_204_NO_CONTENT)


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
        self.perform_create(serializer)

        instance = self._get_filtered_queryset(annotate_only=False).get(
            pk=serializer.instance.pk
        )
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
        self.perform_update(serializer)

        instance = self.get_queryset().get(pk=instance.pk)
        return Response(
            VideoGroupDetailSerializer(
                instance,
                context=self.get_serializer_context(),
            ).data
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
        group, video, error = ResourceValidator.get_group_and_video(
            request.user, group_id, video_id
        )
        if error:
            return error

        return VideoGroupMemberService.add_video_to_group(group, video)


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
    group, error = ResourceValidator.validate_and_get_resource(
        request.user, VideoGroup, group_id, "Group"
    )
    if error:
        return error

    video_ids, error = ResourceValidator.validate_video_ids(request, "Video")
    if error:
        return error

    videos = list(Video.objects.filter(user=request.user, id__in=video_ids))

    error = ResourceValidator.validate_videos_count(videos, video_ids)
    if error:
        return error

    # Identify videos to add (exclude existing members)
    video_ids_list = [v.id for v in videos]
    existing_members = set(
        VideoGroupMemberService.get_member_queryset(group)
        .filter(video_id__in=video_ids_list)
        .values_list("video_id", flat=True)
    )

    video_map = {video.id: video for video in videos}
    videos_to_add = [
        video_map[video_id]
        for video_id in video_ids
        if video_id in video_map and video_id not in existing_members
    ]

    # Bulk create members
    base_order = VideoGroupMemberService.get_next_order(group) - 1
    members_to_create = [
        VideoGroupMember(group=group, video=video, order=base_order + index)
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


@extend_schema(
    responses={200: VideoActionMessageResponseSerializer},
    summary="Remove video from group",
    description="Remove a video from a group.",
)
@authenticated_view_with_error_handling(["DELETE"])
def remove_video_from_group(request, group_id, video_id):
    """Remove video from group"""
    group, video, error = ResourceValidator.get_group_and_video(
        request.user, group_id, video_id
    )
    if error:
        return error

    member, error = VideoGroupMemberService.check_and_get_member(
        group, video, "This video is not added to the group"
    )
    if error:
        return error

    member.delete()
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
    group, error = ResourceValidator.validate_and_get_resource(
        request.user, VideoGroup, group_id, "Group"
    )
    if error:
        return error

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

    members = list(VideoGroupMember.objects.filter(group=group).select_related("video"))

    # Validate video_ids match group members
    group_video_ids = set(member.video_id for member in members)
    if set(video_ids) != group_video_ids:
        return create_error_response(
            "Specified video IDs do not match videos in group",
            status.HTTP_400_BAD_REQUEST,
        )

    # Bulk update order
    member_dict = {member.video_id: member for member in members}
    members_to_update = []

    for index, video_id in enumerate(video_ids):
        member = member_dict[video_id]
        member.order = index
        members_to_update.append(member)

    VideoGroupMember.objects.bulk_update(members_to_update, ["order"])
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
        group, error = ResourceValidator.validate_and_get_resource(
            request.user, VideoGroup, group_id, "Group"
        )
        if error:
            return error

        share_token = secrets.token_urlsafe(32)
        ShareLinkService.update_share_token(group, share_token)

        return Response(
            {
                "message": "Share link generated",
                "share_token": share_token,
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
    group, error = ResourceValidator.validate_and_get_resource(
        request.user, VideoGroup, group_id, "Group"
    )
    if error:
        return error

    if not group.share_token:
        return create_error_response(
            "Share link is not configured", status.HTTP_404_NOT_FOUND
        )

    ShareLinkService.update_share_token(group, None)
    return Response({"message": "Share link disabled"}, status=status.HTTP_200_OK)


@extend_schema(
    responses={200: VideoGroupDetailSerializer},
    summary="Get shared group",
    description="Return a publicly shared group by share token.",
)
@api_view(["GET"])
@permission_classes([AllowAny])
def get_shared_group(request, share_token):
    """
    Get group by share token (no authentication required)

    Public group accessible by anyone
    """
    queryset = VideoGroup.objects.filter(share_token=share_token)

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
        self.perform_create(serializer)

        instance = self.get_queryset().get(pk=serializer.instance.pk)
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
        self.perform_update(serializer)

        instance = self.get_queryset().get(pk=instance.pk)
        return Response(
            TagDetailSerializer(
                instance,
                context=self.get_serializer_context(),
            ).data
        )


@extend_schema(
    request=AddTagsToVideoRequestSerializer,
    responses={201: AddTagsToVideoResponseSerializer},
    operation_id="videos_add_tags",
)
@authenticated_view_with_error_handling(["POST"])
@transaction.atomic
def add_tags_to_video(request, video_id):
    """Add multiple tags to video"""
    video, error = ResourceValidator.validate_and_get_resource(
        request.user, Video, video_id, "Video"
    )
    if error:
        return error

    tag_ids = request.data.get("tag_ids", [])
    if not tag_ids:
        return create_error_response(
            "Tag IDs not specified", status.HTTP_400_BAD_REQUEST
        )

    tags = list(Tag.objects.filter(user=request.user, id__in=tag_ids))
    if len(tags) != len(tag_ids):
        return create_error_response("Some tags not found", status.HTTP_404_NOT_FOUND)

    # Get existing tags
    existing_tags = set(
        VideoTag.objects.filter(video=video, tag_id__in=tag_ids).values_list(
            "tag_id", flat=True
        )
    )

    tags_to_add = [tag for tag in tags if tag.id not in existing_tags]

    # Bulk create
    video_tags = [VideoTag(video=video, tag=tag) for tag in tags_to_add]
    VideoTag.objects.bulk_create(video_tags)

    added_count = len(tags_to_add)
    skipped_count = len(tag_ids) - added_count

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
    """Remove tag from video"""
    video, error = ResourceValidator.validate_and_get_resource(
        request.user, Video, video_id, "Video"
    )
    if error:
        return error

    tag, error = ResourceValidator.validate_and_get_resource(
        request.user, Tag, tag_id, "Tag"
    )
    if error:
        return error

    video_tag = VideoTag.objects.filter(video=video, tag=tag).first()
    if not video_tag:
        return create_error_response(
            "This tag is not attached to the video", status.HTTP_404_NOT_FOUND
        )

    video_tag.delete()
    return Response({"message": "Tag removed from video"}, status=status.HTTP_200_OK)
