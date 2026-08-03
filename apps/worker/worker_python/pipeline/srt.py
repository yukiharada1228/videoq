"""SRT helpers (SubtitleParser.parse_srt_scenes subset)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SrtScene:
    index: int | None
    start_time: str
    end_time: str
    start_sec: float
    end_sec: float
    text: str


def parse_srt_timestamp(timestamp: str) -> float:
    normalized = timestamp.replace(".", ",")
    parts = normalized.split(",")
    time_parts = [int(p) for p in parts[0].split(":")]
    if len(time_parts) == 3:
        hours, minutes, seconds_part = time_parts
    elif len(time_parts) == 2:
        hours = 0
        minutes, seconds_part = time_parts
    else:
        raise ValueError(f"Invalid timestamp: {timestamp}")
    seconds = hours * 3600 + minutes * 60 + seconds_part
    if len(parts) > 1:
        seconds += int(parts[1]) / 1000.0
    return float(seconds)


def format_srt_time(seconds: float) -> str:
    if seconds < 0:
        seconds = 0.0
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    whole = int(secs)
    millis = int(round((secs - whole) * 1000))
    if millis == 1000:
        whole += 1
        millis = 0
    return f"{hours:02d}:{minutes:02d}:{whole:02d},{millis:03d}"


def create_srt_from_whisper_segments(segments: list[dict]) -> str:
    lines: list[str] = []
    for i, seg in enumerate(segments, start=1):
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        start = float(seg.get("start", 0))
        end = float(seg.get("end", start))
        lines.append(str(i))
        lines.append(f"{format_srt_time(start)} --> {format_srt_time(end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def parse_srt_scenes(srt_string: str) -> list[SrtScene]:
    content = srt_string.strip()
    if not content:
        return []
    scenes: list[SrtScene] = []
    for block in content.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        lines = block.split("\n")
        if len(lines) < 3:
            continue
        index: int | None
        try:
            index = int(lines[0].strip())
        except ValueError:
            index = None
        timing = lines[1].strip()
        if "-->" not in timing:
            continue
        start_str, end_str = [t.strip() for t in timing.split("-->", 1)]
        text = "\n".join(lines[2:]).strip()
        if not text:
            continue
        try:
            start_sec = parse_srt_timestamp(start_str)
            end_sec = parse_srt_timestamp(end_str)
        except ValueError:
            continue
        scenes.append(
            SrtScene(
                index=index,
                start_time=start_str,
                end_time=end_str,
                start_sec=start_sec,
                end_sec=end_sec,
                text=text,
            )
        )
    return scenes
