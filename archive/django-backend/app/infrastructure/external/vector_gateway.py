"""
Infrastructure implementations of vector store gateway interfaces.
"""

from app.domain.video.gateways import VectorIndexingGateway, VectorStoreGateway
from app.infrastructure.external.vector_store import (
    delete_video_vectors,
    update_video_title_in_vectors,
)


class DjangoVectorStoreGateway(VectorStoreGateway):
    """Implements VectorStoreGateway using PGVector metadata updates."""

    def update_video_title(self, video_id: int, new_title: str) -> None:
        update_video_title_in_vectors(video_id, new_title)

    def delete_video_vectors(self, video_id: int) -> None:
        delete_video_vectors(video_id)


class DjangoVectorIndexingGateway(VectorIndexingGateway):
    """Implements VectorIndexingGateway using PGVector."""

    def index_video_transcript(
        self, video_id: int, user_id: int, title: str, transcript: str,
        api_key=None,
    ) -> None:
        from app.infrastructure.external.scene_indexer import index_scenes_batch

        # Build a lightweight proxy so index_scenes_batch can access .id, .user_id, .title
        class _VideoProxy:
            def __init__(self, id: int, user_id: int, title: str):
                self.id = id
                self.user_id = user_id
                self.title = title

        proxy = _VideoProxy(id=video_id, user_id=user_id, title=title)

        index_scenes_batch(transcript, proxy, api_key=api_key)

    def delete_all_vectors(self) -> int:
        from app.infrastructure.external.vector_store import delete_all_vectors

        return delete_all_vectors()
