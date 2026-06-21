"""Internal scene-handle DTO for the agentic chat gateway (§8.2).

``SceneRef`` is an infrastructure-internal rich citation handle. It carries
more information than the domain ``CitationDTO`` (which stays at 4 fields);
it is reduced to ``CitationDTO`` by ``CitationRegistry.finalize`` so the
domain layer is never polluted.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class SceneRef:
    """A time-stamped scene fragment usable as a citation handle.

    Attributes:
        video_id: Owning video id.
        video_title: Video title (for CitationDTO.title).
        start_time: SRT-format start ``HH:MM:SS,mmm`` (or None if unknown).
        end_time: SRT-format end ``HH:MM:SS,mmm`` (or None if unknown).
        start_sec: Numeric start seconds (internal only, for dedup/seek).
        end_sec: Numeric end seconds (internal only).
        scene_index: Vector scene index (vector source only; not used for seek
            for transcript source).
        text: Raw scene text (LLM-visible / retrieved_contexts source).
        source: Provenance, ``"vector"`` (search_scenes) or ``"transcript"``
            (get_video).
    """

    video_id: int
    video_title: str
    start_time: Optional[str]
    end_time: Optional[str]
    start_sec: Optional[float]
    end_sec: Optional[float]
    scene_index: Optional[int]
    text: str
    source: str
