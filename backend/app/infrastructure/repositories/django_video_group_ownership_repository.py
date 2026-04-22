"""Django ORM implementation of VideoGroupOwnershipPort."""

from app.domain.evaluation.ports import VideoGroupOwnershipPort
from app.infrastructure.models.video_group import VideoGroup


class DjangoVideoGroupOwnershipRepository(VideoGroupOwnershipPort):
    def is_owner(self, group_id: int, user_id: int) -> bool:
        return VideoGroup.objects.filter(id=group_id, user_id=user_id).exists()
