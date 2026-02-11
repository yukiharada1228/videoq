from django.db.models.signals import post_delete, post_save
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


@receiver(post_save, sender=User)
def create_user_subscription(sender, instance, created, **kwargs):
    """Auto-create a Free Subscription for new users."""
    if created:
        from .subscription import Subscription

        Subscription.objects.get_or_create(user=instance)
