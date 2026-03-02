import secrets

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Prefetch, Q
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
from app.video.adapters import (AddTagsToVideoAdapter, AddVideoToGroupAdapter,
                                AddVideosToGroupAdapter, CreateShareLinkAdapter,
                                DeleteShareLinkAdapter,
                                ReorderVideosInGroupAdapter, UploadVideoAdapter)
from app.video.services import (ResourceService, ShareLinkService,
                                VideoGroupMemberService, VideoTagService,
                                VideoUploadService)
from app.video.use_cases import (AddTagsToVideoCommand, AddTagsToVideoUseCase,
                                 AddVideoToGroupCommand,
                                 AddVideoToGroupUseCase,
                                 AddVideosToGroupCommand,
                                 AddVideosToGroupUseCase,
                                 CreateShareLinkCommand,
                                 CreateShareLinkUseCase,
                                 DeleteShareLinkCommand,
                                 DeleteShareLinkUseCase,
                                 ReorderVideosInGroupCommand,
                                 ReorderVideosInGroupUseCase,
                                 UploadVideoCommand, UploadVideoUseCase)

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

User = get_user_model()

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
        result = UploadVideoUseCase(
            video_creator=UploadVideoAdapter(
                user_model=User,
                video_creator=VideoUploadService.create_video,
            )
        ).execute(
            UploadVideoCommand(
                actor_id=request.user.id,
                validated_data=serializer.validated_data,
            ),
        )
        serializer.instance = self.get_queryset().get(pk=result.video_id)

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
        use_case = AddVideoToGroupUseCase(
            group_member_adder=AddVideoToGroupAdapter(
                user_model=User,
                group_model=VideoGroup,
                video_model=Video,
                owned_resource_loader=ResourceService.get_owned_resource,
                group_member_adder=VideoGroupMemberService.add_video_to_group,
            ),
        )
        try:
            result = use_case.execute(
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
    use_case = AddVideosToGroupUseCase(
        group_members_adder=AddVideosToGroupAdapter(
            user_model=User,
            group_model=VideoGroup,
            video_model=Video,
            owned_resource_loader=ResourceService.get_owned_resource,
            owned_resources_loader=ResourceService.get_owned_resources,
            group_members_adder=VideoGroupMemberService.add_videos_to_group,
        ),
    )
    try:
        result = use_case.execute(
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
    group = ResourceService.get_owned_resource(request.user, VideoGroup, group_id)
    if not group:
        return create_error_response("Group not found", status.HTTP_404_NOT_FOUND)

    video = ResourceService.get_owned_resource(request.user, Video, video_id)
    if not video:
        return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)

    member = VideoGroupMemberService.get_member(group, video)
    if not member:
        return create_error_response(
            "This video is not added to the group", status.HTTP_404_NOT_FOUND
        )

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

    use_case = ReorderVideosInGroupUseCase(
        group_reorderer=ReorderVideosInGroupAdapter(
            user_model=User,
            group_model=VideoGroup,
            owned_resource_loader=ResourceService.get_owned_resource,
            group_reorderer=VideoGroupMemberService.reorder_videos,
        ),
    )
    try:
        use_case.execute(
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
        use_case = CreateShareLinkUseCase(
            share_token_updater=CreateShareLinkAdapter(
                user_model=User,
                group_model=VideoGroup,
                owned_resource_loader=ResourceService.get_owned_resource,
                token_generator=secrets.token_urlsafe,
                share_token_updater=ShareLinkService.update_share_token,
            ),
        )
        try:
            result = use_case.execute(
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
    use_case = DeleteShareLinkUseCase(
        share_token_updater=DeleteShareLinkAdapter(
            user_model=User,
            group_model=VideoGroup,
            owned_resource_loader=ResourceService.get_owned_resource,
            share_token_updater=ShareLinkService.update_share_token,
        ),
    )
    try:
        use_case.execute(
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
    use_case = AddTagsToVideoUseCase(
        video_tags_adder=AddTagsToVideoAdapter(
            user_model=User,
            video_model=Video,
            tag_model=Tag,
            owned_resource_loader=ResourceService.get_owned_resource,
            owned_resources_loader=ResourceService.get_owned_resources,
            video_tags_adder=VideoTagService.add_tags_to_video,
        ),
    )
    try:
        result = use_case.execute(
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
    video = ResourceService.get_owned_resource(request.user, Video, video_id)
    if not video:
        return create_error_response("Video not found", status.HTTP_404_NOT_FOUND)

    tag = ResourceService.get_owned_resource(request.user, Tag, tag_id)
    if not tag:
        return create_error_response("Tag not found", status.HTTP_404_NOT_FOUND)

    video_tag = VideoTag.objects.filter(video=video, tag=tag).first()
    if not video_tag:
        return create_error_response(
            "This tag is not attached to the video", status.HTTP_404_NOT_FOUND
        )

    video_tag.delete()
    return Response({"message": "Tag removed from video"}, status=status.HTTP_200_OK)
