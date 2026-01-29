from django.db import transaction
from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver

from .user import User
from .video import Video


@receiver(post_delete, sender=Video)
def delete_video_vectors_signal(sender, instance, **kwargs):
    """
    Delete vector data from PGVector when Video is deleted
    """
    try:
        from app.utils.vector_manager import delete_video_vectors

        delete_video_vectors(instance.id)

    except Exception as e:
        # Vector deletion failure should not prevent video deletion
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to delete vectors for video {instance.id}: {e}")


def _should_delete_videos(old_limit, new_limit):
    """
    Determine if videos should be deleted based on limit change.

    Returns True if:
    - old_limit is None (unlimited) and new_limit is not None
    - old_limit is a number and new_limit is a smaller number (including 0)

    Returns False if:
    - old_limit == new_limit (no change)
    - new_limit is None (changing to unlimited)
    - new_limit > old_limit (increasing limit)
    """
    # No change
    if old_limit == new_limit:
        return False

    # Changing to unlimited - keep all videos
    if new_limit is None:
        return False

    # From unlimited to limited
    if old_limit is None:
        return True

    # From limited to more limited
    if new_limit < old_limit:
        return True

    return False


@receiver(pre_save, sender=User)
def handle_video_limit_reduction(sender, instance, **kwargs):
    """
    Automatically delete excess videos when video_limit is reduced.
    Deletes oldest videos first (based on uploaded_at ascending).
    """
    # Skip if this is a new user (not yet saved)
    if instance.pk is None:
        return

    try:
        # Fetch old value from database
        old_user = User.objects.get(pk=instance.pk)
        old_limit = old_user.video_limit
        new_limit = instance.video_limit

        # Check if deletion is needed
        if not _should_delete_videos(old_limit, new_limit):
            return

        # Calculate how many videos to keep
        videos_to_keep = new_limit if new_limit is not None else float("inf")

        # Get current video count
        current_count = Video.objects.filter(user=instance).count()

        # Calculate how many videos to delete
        videos_to_delete_count = current_count - videos_to_keep

        # Query videos to delete (oldest first)
        if videos_to_delete_count > 0:
            videos_to_delete = Video.objects.filter(user=instance).order_by(
                "uploaded_at"
            )[  # ASC - oldest first
                :videos_to_delete_count
            ]  # Delete first N oldest videos
        else:
            videos_to_delete = Video.objects.none()

        # Delete in transaction
        with transaction.atomic():
            count = videos_to_delete.count()
            if count > 0:
                for video in videos_to_delete:
                    # Delete file explicitly
                    if video.file:
                        video.file.delete(save=False)
                    # Delete video instance (triggers CASCADE and post_delete signal)
                    video.delete()

                import logging

                logger = logging.getLogger(__name__)
                logger.info(
                    f"Deleted {count} excess videos for user {instance.username} "
                    f"(video_limit reduced from {old_limit} to {new_limit})"
                )

    except User.DoesNotExist:
        # New user, skip
        pass
    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.error(f"Failed to delete excess videos for user {instance.pk}: {e}")
        # Re-raise to prevent save if deletion fails
        raise
