from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SubtitleItem:
    index: int | None
    start_time: str
    end_time: str
    start_sec: float
    end_sec: float
    text: str


@dataclass
class SceneSegment:
    start_time: str
    end_time: str
    subtitles: list[str] = field(default_factory=list)
