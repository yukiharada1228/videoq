"""
Django ORM implementation of share-token resolver.
"""

from app.domain.auth.dtos import ShareAuthContextDTO
from app.infrastructure.models import VideoGroup


class DjangoShareTokenResolver:
    def resolve(self, token: str) -> ShareAuthContextDTO | None:
        group = (
            VideoGroup.objects.filter(share_token=token).only("id", "share_token").first()
        )
        if group is None:
            return None
        return ShareAuthContextDTO(share_token=token, group_id=group.id)
