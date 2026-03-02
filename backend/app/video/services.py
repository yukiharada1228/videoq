import logging

from django.db import transaction

from app.models import VideoGroupMember, VideoTag
from app.tasks import transcribe_video
from app.video import repositories

logger = logging.getLogger(__name__)


class ResourceService:
    """Data-access helpers for user-owned resources."""

    @staticmethod
    def get_owned_resource(
        user, model_class, resource_id, select_related_fields=None
    ):
        return repositories.get_owned_resource(
            user=user,
            model_class=model_class,
            resource_id=resource_id,
            select_related_fields=select_related_fields,
        )

    @staticmethod
    def get_owned_resources(user, model_class, resource_ids):
        return repositories.get_owned_resources(
            user=user,
            model_class=model_class,
            resource_ids=resource_ids,
        )


class VideoUploadService:
    """Application service for video uploads."""

    @staticmethod
    def validate_upload_allowed(*, user):
        """Raise ValueError when the user has reached their upload limit."""
        video_limit = user.video_limit
        if video_limit is None:
            return

        current_video_count = repositories.count_user_videos(user=user)
        if current_video_count >= video_limit:
            raise ValueError(
                f"Video upload limit reached. You can upload up to {video_limit} video(s)."
            )

    @staticmethod
    @transaction.atomic
    def create_video(*, user, validated_data):
        video = repositories.create_video(user=user, validated_data=validated_data)

        def _dispatch_transcription():
            logger.info(f"Starting transcription task for video ID: {video.id}")
            try:
                task = transcribe_video.delay(video.id)
                logger.info(f"Transcription task created with ID: {task.id}")
            except Exception as exc:
                logger.error(f"Failed to start transcription task: {exc}")

        transaction.on_commit(_dispatch_transcription)
        return video


class VideoGroupMemberService:
    """Business operations for group membership."""

    @staticmethod
    def get_member_queryset(group, video=None, select_related=False):
        return repositories.get_member_queryset(
            group=group,
            video=video,
            select_related=select_related,
        )

    @staticmethod
    def get_member(group, video):
        return repositories.get_member(group=group, video=video)

    @staticmethod
    def get_next_order(group):
        return repositories.get_next_group_order(group=group)

    @staticmethod
    @transaction.atomic
    def add_video_to_group(group, video):
        if VideoGroupMemberService.get_member(group, video):
            return None

        member = repositories.create_group_member(
            group=group,
            video=video,
            order=VideoGroupMemberService.get_next_order(group),
        )
        return member

    @staticmethod
    @transaction.atomic
    def add_videos_to_group(group, videos, requested_video_ids):
        """Add multiple videos, preserving request order and skipping existing ones."""
        video_ids_list = [video.id for video in videos]
        existing_members = repositories.get_existing_member_video_ids(
            group=group,
            video_ids=video_ids_list,
        )

        video_map = {video.id: video for video in videos}
        videos_to_add = [
            video_map[video_id]
            for video_id in requested_video_ids
            if video_id in video_map and video_id not in existing_members
        ]

        base_order = VideoGroupMemberService.get_next_order(group) - 1
        members_to_create = [
            VideoGroupMember(group=group, video=video, order=base_order + index)
            for index, video in enumerate(videos_to_add, start=1)
        ]
        repositories.bulk_create_group_members(members=members_to_create)

        added_count = len(members_to_create)
        skipped_count = len(requested_video_ids) - added_count
        return {
            "added_count": added_count,
            "skipped_count": skipped_count,
        }

    @staticmethod
    @transaction.atomic
    def reorder_videos(group, video_ids):
        """Reorder videos in a group, validating the exact membership set."""
        members = repositories.get_members_for_reorder(group=group)
        group_video_ids = {member.video_id for member in members}
        if set(video_ids) != group_video_ids:
            raise ValueError("Specified video IDs do not match videos in group")

        member_dict = {member.video_id: member for member in members}
        members_to_update = []
        for index, video_id in enumerate(video_ids):
            member = member_dict[video_id]
            member.order = index
            members_to_update.append(member)

        repositories.bulk_update_group_members(members=members_to_update)


class VideoTagService:
    """Business operations for video tags."""

    @staticmethod
    @transaction.atomic
    def add_tags_to_video(video, tags, requested_tag_ids):
        existing_tags = repositories.get_existing_video_tag_ids(
            video=video,
            tag_ids=requested_tag_ids,
        )

        tags_to_add = [tag for tag in tags if tag.id not in existing_tags]
        video_tags = [VideoTag(video=video, tag=tag) for tag in tags_to_add]
        repositories.bulk_create_video_tags(video_tags=video_tags)

        added_count = len(tags_to_add)
        skipped_count = len(requested_tag_ids) - added_count
        return {
            "added_count": added_count,
            "skipped_count": skipped_count,
        }


class ShareLinkService:
    """Business operations for share links."""

    @staticmethod
    def update_share_token(group, token_value):
        repositories.save_group_share_token(group=group, token_value=token_value)
