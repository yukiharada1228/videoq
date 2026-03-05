"""
Django ORM implementation of ProtectedMediaRepository.
All ORM access for the media domain is isolated here.
"""

from typing import Optional

from app.domain.media.ports import ProtectedMediaRepository
from app.models import Video, VideoGroupMember


class DjangoMediaRepository(ProtectedMediaRepository):
    def find_video_id_by_file_path(self, path: str) -> Optional[int]:
        video = Video.objects.filter(file=path).first()
        if video is None:
            return None
        return video.id

    def is_video_owned_by_user(self, video_id: int, user_id: int) -> bool:
        return Video.objects.filter(id=video_id, user_id=user_id).exists()

    def is_video_in_group(self, video_id: int, group_id: int) -> bool:
        return VideoGroupMember.objects.filter(
            group_id=group_id, video_id=video_id
        ).exists()
