"""Turn-scoped citation ledger for the agentic chat gateway (§8.3, §8.4).

During a single agent turn every ``SceneRef`` produced by a tool is registered
here and assigned a 1-based ``ref_id`` in appearance order. After the LLM has
written its answer, :meth:`CitationRegistry.finalize` scans the body for
``[n]`` tokens, keeps only the refs actually cited, renumbers them ``1..K`` in
order of first appearance, rewrites the body accordingly, and reduces the
surviving ``SceneRef`` handles to domain ``CitationDTO`` objects (4 fields
only). This keeps the ordinal contract (citations array order == body ``[n]``
order, §8.1) while never polluting the domain layer with ``SceneRef`` metadata.
"""

import logging
import re
from typing import List, Optional, Tuple

from app.domain.chat.dtos import CitationDTO
from app.infrastructure.external.agentic.scene_ref import SceneRef

logger = logging.getLogger(__name__)

# Matches inline citation tokens such as ``[1]`` / ``[12]`` (§8.4).
_CITATION_TOKEN_RE = re.compile(r"\[(\d+)\]")


class CitationRegistry:
    """Assigns and renumbers citation ids for a single agent turn.

    Refs are deduplicated by ``(video_id, start_sec)`` so the same scene cited
    by different tools shares one id. Insertion order is preserved, which is the
    appearance order used for the streaming-friendly numbering scheme (§8.4).
    """

    def __init__(self) -> None:
        # ref_id (1-based) -> SceneRef, kept in insertion order.
        self._scenes: List[SceneRef] = []
        # (video_id, start_sec) -> ref_id, for dedup.
        self._index: dict[Tuple[int, Optional[float]], int] = {}

    def register(self, scene: SceneRef) -> int:
        """Register a scene and return its ref_id (1-based).

        Args:
            scene: The scene handle to register.

        Returns:
            The 1-based ref_id. A previously registered scene with the same
            ``(video_id, start_sec)`` returns its existing id (dedup).
        """
        key = (scene.video_id, scene.start_sec)
        existing = self._index.get(key)
        if existing is not None:
            return existing

        self._scenes.append(scene)
        ref_id = len(self._scenes)
        self._index[key] = ref_id
        return ref_id

    def scene_at(self, ref_id: int) -> Optional[SceneRef]:
        """Return the SceneRef for a 1-based ref_id, or None if out of range.

        Args:
            ref_id: The 1-based ref_id assigned by :meth:`register`.

        Returns:
            The registered :class:`SceneRef`, or ``None`` when ``ref_id`` is not
            a valid registered id (used by the streaming remapper to detect and
            drop orphan ``[n]`` tokens, §8.5.6).
        """
        if ref_id < 1 or ref_id > len(self._scenes):
            return None
        return self._scenes[ref_id - 1]

    def finalize(
        self, answer_text: str
    ) -> Tuple[str, List[CitationDTO], List[str]]:
        """Renumber cited refs and reduce them to domain citations.

        Scans ``answer_text`` for ``[n]`` tokens, drops refs that were never
        cited, renumbers the survivors ``1..K`` in order of first appearance,
        rewrites the body so each ``[old]`` becomes ``[new]``, and drops any
        ``[n]`` referring to an unregistered ref (§8.5.6 — no orphan tokens).

        Args:
            answer_text: The LLM answer body containing ``[n]`` tokens.

        Returns:
            A tuple ``(body, citations, retrieved_contexts)`` where ``body`` is
            the renumbered answer, ``citations`` are 4-field ``CitationDTO``
            objects in the new ``1..K`` order, and ``retrieved_contexts`` are
            the surviving scenes' ``text`` in the same order.
        """
        # Old ref_id -> new sequential id, in order of first appearance.
        old_to_new: dict[int, int] = {}
        # New id -> the SceneRef it maps to (new id == len at assignment time).
        survivors: List[SceneRef] = []

        cited_ids: set[int] = set()
        for match in _CITATION_TOKEN_RE.finditer(answer_text):
            old_id = int(match.group(1))
            cited_ids.add(old_id)
            if old_id in old_to_new:
                continue
            if old_id < 1 or old_id > len(self._scenes):
                # Unknown ref: not in the registry. Dropped from the body below.
                continue
            new_id = len(survivors) + 1
            old_to_new[old_id] = new_id
            survivors.append(self._scenes[old_id - 1])

        registered_ids = set(range(1, len(self._scenes) + 1))
        if cited_ids != registered_ids:
            logger.warning(
                "Citation mismatch: body refs %s differ from registry ids %s "
                "(unknown=%s, uncited=%s)",
                sorted(cited_ids),
                sorted(registered_ids),
                sorted(cited_ids - registered_ids),
                sorted(registered_ids - cited_ids),
            )

        def _rewrite(match: "re.Match[str]") -> str:
            old_id = int(match.group(1))
            new_id = old_to_new.get(old_id)
            if new_id is None:
                # Orphan/unknown ref: drop the bracket token entirely (§8.5.6).
                return ""
            return f"[{new_id}]"

        body = _CITATION_TOKEN_RE.sub(_rewrite, answer_text)

        citations = [
            CitationDTO(
                video_id=scene.video_id,
                title=scene.video_title,
                start_time=scene.start_time,
                end_time=scene.end_time,
            )
            for scene in survivors
        ]
        retrieved_contexts = [scene.text for scene in survivors]

        return body, citations, retrieved_contexts
