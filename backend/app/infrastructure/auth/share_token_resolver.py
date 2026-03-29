"""
Django ORM implementation of share-token resolver.
"""

from app.domain.auth.dtos import ShareAuthContextDTO
from app.infrastructure.models import VideoGroup


class DjangoShareTokenResolver:
    def resolve(self, share_slug: str) -> ShareAuthContextDTO | None:
        group = (
            VideoGroup.objects.filter(share_slug=share_slug).only("id", "share_slug").first()
        )
        if group is None:
            return None
        return ShareAuthContextDTO(share_slug=group.share_slug, group_id=group.id)
