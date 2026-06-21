"""PGVector-backed implementation of the scene-search domain port (§5.1.1).

Implements :class:`app.domain.chat.gateways.SceneSearchGateway` by querying the
shared PGVector store via :class:`PGVectorManager`. The k-search logic mirrors
the retriever construction in ``rag_service.py`` (scoped to the requesting user
and the supplied video ids), and each returned LangChain document is mapped to a
domain ``SceneSearchResultDTO`` using the scene metadata schema produced by
``scene_indexer.create_scene_metadata``.
"""

import logging
from typing import Any, List, Optional, Sequence

from app.domain.chat.gateways import SceneSearchGateway, SceneSearchResultDTO
from app.infrastructure.common.embeddings import get_embeddings
from app.infrastructure.external.vector_store import PGVectorManager

logger = logging.getLogger(__name__)

# Hard upper bound on the number of scenes a single search may return (§5.1.1).
_MAX_K = 20


class PgVectorSceneSearchGateway(SceneSearchGateway):
    """Semantic scene search over the PGVector store.

    Builds a retriever scoped to ``user_id`` and the requested ``video_ids`` and
    maps each matched document into a :class:`SceneSearchResultDTO`.
    """

    def search(
        self,
        *,
        user_id: int,
        video_ids: Sequence[int],
        query: str,
        k: int,
    ) -> List[SceneSearchResultDTO]:
        """Return up to ``min(k, 20)`` scenes most relevant to ``query``.

        Args:
            user_id: ID of the user making the request (for retrieval scoping).
            video_ids: Video IDs to scope the search to. Empty -> ``[]``.
            query: Natural-language search query.
            k: Maximum number of scenes to return (clamped to ``20``).

        Returns:
            A list of ``SceneSearchResultDTO`` ordered by relevance.
        """
        video_id_list = list(video_ids)
        if not video_id_list:
            return []

        clamped_k = min(k, _MAX_K)
        if clamped_k <= 0:
            return []

        vector_store = self._create_vector_store()
        retriever = vector_store.as_retriever(
            search_kwargs={
                "k": clamped_k,
                "filter": {
                    "user_id": user_id,
                    "video_id": {"$in": video_id_list},
                },
            }
        )

        docs = retriever.invoke(query)
        return [self._map_doc(doc) for doc in docs]

    def _create_vector_store(self) -> Any:
        embeddings = get_embeddings()
        return PGVectorManager.create_vectorstore(embeddings)

    @staticmethod
    def _map_doc(doc: Any) -> SceneSearchResultDTO:
        metadata = getattr(doc, "metadata", {}) or {}
        return SceneSearchResultDTO(
            video_id=metadata.get("video_id"),
            video_title=metadata.get("video_title", ""),
            start_time=PgVectorSceneSearchGateway._opt_str(metadata.get("start_time")),
            end_time=PgVectorSceneSearchGateway._opt_str(metadata.get("end_time")),
            start_sec=PgVectorSceneSearchGateway._opt_float(metadata.get("start_sec")),
            end_sec=PgVectorSceneSearchGateway._opt_float(metadata.get("end_sec")),
            scene_index=PgVectorSceneSearchGateway._opt_int(metadata.get("scene_index")),
            text=getattr(doc, "page_content", "") or "",
        )

    @staticmethod
    def _opt_str(value: Any) -> Optional[str]:
        if value is None or value == "":
            return None
        return str(value)

    @staticmethod
    def _opt_float(value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _opt_int(value: Any) -> Optional[int]:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
