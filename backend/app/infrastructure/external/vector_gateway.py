"""
Infrastructure implementations of vector store gateway interfaces.
"""

from app.domain.video.gateways import VectorIndexingGateway, VectorStoreGateway
from app.infrastructure.external.vector_store import update_video_title_in_vectors


class DjangoVectorStoreGateway(VectorStoreGateway):
    """Implements VectorStoreGateway using PGVector metadata updates."""

    def update_video_title(self, video_id: int, new_title: str) -> None:
        update_video_title_in_vectors(video_id, new_title)


class DjangoVectorIndexingGateway(VectorIndexingGateway):
    """Implements VectorIndexingGateway using PGVector."""

    def index_video_transcript(
        self, video_id: int, user_id: int, title: str, transcript: str
    ) -> None:
        from app.tasks.vector_indexing import index_scenes_batch

        # Build a lightweight proxy so index_scenes_batch can access .id, .user_id, .title
        class _VideoProxy:
            pass

        proxy = _VideoProxy()
        proxy.id = video_id
        proxy.user_id = user_id
        proxy.title = title

        index_scenes_batch(transcript, proxy)

    def delete_all_vectors(self) -> int:
        from app.infrastructure.external.vector_store import delete_all_vectors

        return delete_all_vectors()
