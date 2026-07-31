from dataclasses import dataclass, field


@dataclass
class SubtitleItem:
    """Represents a single subtitle block from an SRT file"""

    index: int | None
    start_time: str
    end_time: str
    start_sec: float
    end_sec: float
    text: str


@dataclass
class SceneSegment:
    """Represents a collection of subtitles that form a semantic scene"""

    start_time: str
    end_time: str
    subtitles: list[str] = field(default_factory=list)
