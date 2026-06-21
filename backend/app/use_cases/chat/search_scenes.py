"""Scene-search use case (§5.1.1).

Orchestrates semantic scene search by delegating to a
:class:`app.domain.chat.gateways.SceneSearchGateway`. The use case stays free of
Django and infrastructure imports, talking to the vector store only through the
domain port.
"""

from dataclasses import dataclass, field
from typing import List, Sequence

from app.domain.chat.gateways import SceneSearchGateway, SceneSearchResultDTO

# Hard upper bound on the number of scenes a single search may return (§5.1.1).
_MAX_K = 20


@dataclass
class SearchScenesResultDTO:
    """Result wrapper for :meth:`SearchScenesUseCase.execute`.

    Attributes:
        results: Scenes matched by the search, ordered by relevance.
    """

    results: List[SceneSearchResultDTO] = field(default_factory=list)


class SearchScenesUseCase:
    """Run a semantic scene search over the user's indexed videos."""

    def __init__(self, scene_search_gateway: SceneSearchGateway) -> None:
        """Initialise the use case.

        Args:
            scene_search_gateway: Domain port backing the vector scene search.
        """
        self._scene_search_gateway = scene_search_gateway

    def execute(
        self,
        *,
        user_id: int,
        video_ids: Sequence[int],
        query: str,
        k: int = 8,
    ) -> SearchScenesResultDTO:
        """Search for scenes relevant to ``query``.

        Args:
            user_id: ID of the user making the request (for retrieval scoping).
            video_ids: Video IDs to scope the search to.
            query: Natural-language search query.
            k: Maximum number of scenes to return (clamped to ``20``).

        Returns:
            A ``SearchScenesResultDTO`` wrapping the matched scenes.
        """
        clamped_k = min(k, _MAX_K)
        results = self._scene_search_gateway.search(
            user_id=user_id,
            video_ids=video_ids,
            query=query,
            k=clamped_k,
        )
        return SearchScenesResultDTO(results=list(results))
