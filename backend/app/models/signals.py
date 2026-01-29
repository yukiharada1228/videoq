from django.db import transaction
from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver

from .user import User
from .video import Video


@receiver(post_delete, sender=Video)
def delete_video_vectors_signal(sender, instance, **kwargs):
    """
    Remove PGVector embeddings associated with a Video instance when it is deleted.
    
    If vector deletion fails, a warning is logged and the failure does not prevent the Video deletion.
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
    Determine whether reducing a user's video limit should trigger deletion of existing videos.
    
    Parameters:
        old_limit (int | None): Previous video limit; `None` means unlimited.
        new_limit (int | None): New video limit to apply; `None` means unlimited.
    
    Returns:
        bool: `true` if videos must be deleted to satisfy the new limit, `false` otherwise.
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
    Delete a user's oldest videos when their `video_limit` is reduced.
    
    Skips new users (unsaved instances). If the new limit is lower than the previous limit (or the user is transitioning from unlimited to limited),
    the handler deletes the oldest videos first until the user's stored videos satisfy the new limit. Deletion occurs inside a database transaction;
    each video's file (if present) is removed before the video instance is deleted. Successful deletions are logged. On unexpected errors the error
    is logged and the exception is re-raised to prevent saving the User with an inconsistent state.
    
    Parameters:
        sender: The model class sending the signal (typically User).
        instance: The User instance being saved (with the new `video_limit` applied).
        **kwargs: Additional signal keyword arguments (ignored).
    
    Raises:
        Exception: Any unexpected error encountered while deleting videos is logged and re-raised.
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
                # Collect file references for deletion after transaction commits
                files_to_delete = []
                for video in videos_to_delete:
                    if video.file:
                        files_to_delete.append(video.file)
                
                # Delete video instances inside transaction (triggers CASCADE and post_delete signal)
                for video in videos_to_delete:
                    video.delete()

                # Register file deletion to happen after transaction commits
                def delete_files():
                    for file_field in files_to_delete:
                        try:
                            file_field.delete(save=False)
                        except Exception as e:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.warning(f"Failed to delete file {file_field.name}: {e}")

                transaction.on_commit(delete_files)

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