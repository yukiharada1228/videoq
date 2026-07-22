"""Group-scoped retrieval tools for the QA tool-calling agent."""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Optional, Sequence, Set

from django.conf import settings
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.infrastructure.common.embeddings import get_embeddings
from app.infrastructure.external.vector_store import (
    PGVectorManager,
    fetch_video_scenes,
)
from app.infrastructure.models import Video

logger = logging.getLogger(__name__)

_DEFAULT_SCENE_PAGE = 10
_MAX_SCENE_PAGE = 30


@dataclass(frozen=True)
class SceneHit:
    """Normalized scene payload shared by tools and the agent."""

    video_id: int
    video_title: str
    start_time: str
    end_time: str
    page_content: str
    scene_index: Optional[int] = None

    @property
    def dedupe_key(self) -> tuple:
        if self.scene_index is not None:
            return (self.video_id, self.scene_index)
        return (self.video_id, self.start_time, self.end_time, self.page_content[:80])

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def scene_from_doc(doc: Any) -> Optional[SceneHit]:
    """Build a SceneHit from a LangChain Document-like object."""
    content = (getattr(doc, "page_content", None) or "").strip()
    if not content:
        return None
    metadata = getattr(doc, "metadata", None) or {}
    try:
        video_id = int(metadata.get("video_id", 0) or 0)
    except (TypeError, ValueError):
        video_id = 0
    if not video_id:
        return None
    scene_index_raw = metadata.get("scene_index")
    scene_index: Optional[int]
    try:
        scene_index = int(scene_index_raw) if scene_index_raw is not None else None
    except (TypeError, ValueError):
        scene_index = None
    return SceneHit(
        video_id=video_id,
        video_title=str(metadata.get("video_title", "") or ""),
        start_time=str(metadata.get("start_time", "") or ""),
        end_time=str(metadata.get("end_time", "") or ""),
        page_content=content,
        scene_index=scene_index,
    )


def scene_from_row(
    *,
    content: str,
    metadata: Dict[str, Any],
    video_id: int,
) -> Optional[SceneHit]:
    """Build a SceneHit from a raw vector-store row."""
    text = (content or "").strip()
    if not text:
        return None
    scene_index_raw = metadata.get("scene_index")
    try:
        scene_index = int(scene_index_raw) if scene_index_raw is not None else None
    except (TypeError, ValueError):
        scene_index = None
    return SceneHit(
        video_id=int(video_id),
        video_title=str(metadata.get("video_title", "") or ""),
        start_time=str(metadata.get("start_time", "") or ""),
        end_time=str(metadata.get("end_time", "") or ""),
        page_content=text,
        scene_index=scene_index,
    )


class ListGroupVideosInput(BaseModel):
    """No arguments; lists videos in the current group scope."""


class SearchScenesInput(BaseModel):
    query: str = Field(..., description="Semantic search query for relevant scenes.")
    video_ids: Optional[List[int]] = Field(
        default=None,
        description="Optional subset of group video IDs to search within.",
    )
    k: Optional[int] = Field(
        default=None,
        description="Max scenes to return for this search (capped by server).",
    )


class GetVideoScenesInput(BaseModel):
    video_id: int = Field(..., description="Video ID within the current group.")
    offset: int = Field(default=0, ge=0, description="Scene offset (chronological).")
    limit: Optional[int] = Field(
        default=None,
        description="Max scenes to return (chronological page).",
    )


class QaSceneToolkit:
    """Retrieval helpers bound to a single user + allowed video ID set."""

    def __init__(self, *, user_id: int, allowed_video_ids: Sequence[int]) -> None:
        self.user_id = int(user_id)
        self.allowed_video_ids: Set[int] = {int(v) for v in allowed_video_ids if v}
        self._collected: Dict[tuple, SceneHit] = {}
        self._catalog: Optional[List[Dict[str, Any]]] = None

    @property
    def collected_scenes(self) -> List[SceneHit]:
        return list(self._collected.values())

    @property
    def video_catalog(self) -> List[Dict[str, Any]]:
        """Cached group video inventory (id/title/status)."""
        if self._catalog is None:
            self.load_video_catalog()
        return list(self._catalog or [])

    def remember(self, scenes: Sequence[SceneHit]) -> None:
        for scene in scenes:
            self._collected[scene.dedupe_key] = scene

    def load_video_catalog(self) -> List[Dict[str, Any]]:
        """Load and cache the group video list (also used by list_group_videos)."""
        if not self.allowed_video_ids:
            self._catalog = []
            return []
        videos = (
            Video.objects.filter(id__in=self.allowed_video_ids, user_id=self.user_id)
            .order_by("id")
            .values("id", "title", "status")
        )
        self._catalog = [
            {"video_id": row["id"], "title": row["title"], "status": row["status"]}
            for row in videos
        ]
        return list(self._catalog)

    def _clamp_k(self, k: Optional[int]) -> int:
        default_k = int(getattr(settings, "QA_AGENT_SEARCH_K", 10) or 10)
        value = default_k if k is None else int(k)
        return max(1, min(value, _MAX_SCENE_PAGE))

    def _resolve_video_ids(self, video_ids: Optional[Sequence[int]]) -> List[int]:
        if not self.allowed_video_ids:
            return []
        if not video_ids:
            return sorted(self.allowed_video_ids)
        requested = {int(v) for v in video_ids if v}
        return sorted(requested & self.allowed_video_ids)

    def list_group_videos(self) -> str:
        catalog = self.load_video_catalog()
        payload = {"videos": catalog, "count": len(catalog)}
        return json.dumps(payload, ensure_ascii=False)

    def search_scenes(
        self,
        query: str,
        video_ids: Optional[List[int]] = None,
        k: Optional[int] = None,
    ) -> str:
        query_text = (query or "").strip()
        scoped_ids = self._resolve_video_ids(video_ids)
        if not query_text or not scoped_ids:
            return json.dumps({"scenes": [], "count": 0})

        limit = self._clamp_k(k)
        try:
            store = PGVectorManager.create_vectorstore(get_embeddings())
            docs = store.similarity_search(
                query_text,
                k=limit,
                filter={
                    "user_id": self.user_id,
                    "video_id": {"$in": scoped_ids},
                },
            )
        except Exception:
            logger.exception("search_scenes failed for user_id=%s", self.user_id)
            return json.dumps(
                {"scenes": [], "count": 0, "error": "search_failed"},
                ensure_ascii=False,
            )

        scenes: List[SceneHit] = []
        for doc in docs:
            hit = scene_from_doc(doc)
            if hit is None or hit.video_id not in self.allowed_video_ids:
                continue
            scenes.append(hit)
        self.remember(scenes)
        return json.dumps(
            {"scenes": [s.to_dict() for s in scenes], "count": len(scenes)},
            ensure_ascii=False,
        )

    def get_video_scenes(
        self,
        video_id: int,
        offset: int = 0,
        limit: Optional[int] = None,
    ) -> str:
        vid = int(video_id)
        if vid not in self.allowed_video_ids:
            return json.dumps(
                {
                    "scenes": [],
                    "count": 0,
                    "error": "video_not_in_group",
                },
                ensure_ascii=False,
            )

        page_limit = self._clamp_k(limit if limit is not None else _DEFAULT_SCENE_PAGE)
        page_offset = max(0, int(offset or 0))
        try:
            rows = fetch_video_scenes(
                user_id=self.user_id,
                video_id=vid,
                limit=page_limit,
                offset=page_offset,
            )
        except Exception:
            logger.exception(
                "get_video_scenes failed for user_id=%s video_id=%s",
                self.user_id,
                vid,
            )
            return json.dumps(
                {"scenes": [], "count": 0, "error": "fetch_failed"},
                ensure_ascii=False,
            )

        scenes: List[SceneHit] = []
        for row in rows:
            hit = scene_from_row(
                content=row.get("content", ""),
                metadata=row.get("metadata") or {},
                video_id=vid,
            )
            if hit is not None:
                scenes.append(hit)
        self.remember(scenes)
        return json.dumps(
            {
                "scenes": [s.to_dict() for s in scenes],
                "count": len(scenes),
                "offset": page_offset,
                "limit": page_limit,
            },
            ensure_ascii=False,
        )

    def as_langchain_tools(self) -> List[StructuredTool]:
        return [
            StructuredTool.from_function(
                name="list_group_videos",
                description=(
                    "List videos in the current video group (id, title, status). "
                    "Call this before narrowing search to specific videos."
                ),
                func=self.list_group_videos,
                args_schema=ListGroupVideosInput,
            ),
            StructuredTool.from_function(
                name="search_scenes",
                description=(
                    "Semantically search scene transcripts in the group. "
                    "Optionally restrict to video_ids from list_group_videos. "
                    "Use rewritten queries when the first search is weak."
                ),
                func=self.search_scenes,
                args_schema=SearchScenesInput,
            ),
            StructuredTool.from_function(
                name="get_video_scenes",
                description=(
                    "Fetch chronological scenes for one group video (paginated). "
                    "Use when semantic search misses content or you need coverage "
                    "around a known video."
                ),
                func=self.get_video_scenes,
                args_schema=GetVideoScenesInput,
            ),
        ]
