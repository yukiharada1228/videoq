"""
Infrastructure implementation of VectorStoreGateway.
Delegates to the existing update_video_title_in_vectors function.
"""

from app.domain.video.gateways import VectorStoreGateway
from app.infrastructure.external.vector_store import update_video_title_in_vectors


class DjangoVectorStoreGateway(VectorStoreGateway):
    """Implements VectorStoreGateway using PGVector metadata updates."""

    def update_video_title(self, video_id: int, new_title: str) -> None:
        update_video_title_in_vectors(video_id, new_title)
