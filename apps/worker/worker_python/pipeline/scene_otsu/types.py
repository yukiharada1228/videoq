from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SceneSegment:
    start_time: str
    end_time: str
    subtitles: list[str] = field(default_factory=list)
