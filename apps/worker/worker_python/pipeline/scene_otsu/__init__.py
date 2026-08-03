"""VideoQ Otsu-based scene splitting."""

from __future__ import annotations

import logging

from .embedders import SceneEmbedder, create_embedder
from .parsers import SubtitleParser, scenes_to_srt_string
from .splitter import SceneSplitter, l2_normalize
from .types import SceneSegment, SubtitleItem
from .utils import TimestampConverter

logger = logging.getLogger(__name__)

__all__ = [
    "SceneEmbedder",
    "SceneSegment",
    "SceneSplitter",
    "SubtitleItem",
    "SubtitleParser",
    "TimestampConverter",
    "apply_scene_splitting",
    "create_embedder",
    "l2_normalize",
    "scenes_to_srt_string",
]


def count_scenes(srt_content: str) -> int:
    return len(
        [
            line
            for line in srt_content.split("\n")
            if line.strip() and line.strip().isdigit()
        ]
    )


def apply_scene_splitting(
    srt_content: str,
    *,
    original_segment_count: int | None = None,
    max_tokens: int = 512,
) -> tuple[str, int | None]:
    """
    Apply Otsu scene splitting. On failure, return the original SRT
    Failures degrade gracefully and return the original SRT.
    """
    try:
        splitter = SceneSplitter()
        scene_split_srt = splitter.process(srt_content, max_tokens=max_tokens)
        scene_count = count_scenes(scene_split_srt)
        logger.info(
            "Scene splitting completed. Original: %s segments, Scenes: %s",
            original_segment_count,
            scene_count,
        )
        return scene_split_srt, scene_count
    except Exception as exc:  # noqa: BLE001 — best-effort scene splitting
        logger.warning("Scene splitting failed: %s. Using original SRT content.", exc)
        return srt_content, original_segment_count
