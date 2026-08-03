from __future__ import annotations

from .types import SceneSegment, SubtitleItem
from .utils import TimestampConverter


class SubtitleParser:
    @staticmethod
    def parse_srt_string(srt_string: str) -> list[tuple[str, str, str]]:
        content = srt_string.strip()
        blocks = [b.strip() for b in content.split("\n\n") if b.strip()]
        subtitles: list[tuple[str, str, str]] = []
        for block in blocks:
            lines = block.split("\n")
            if len(lines) < 3:
                continue
            timing = lines[1].strip()
            if "-->" not in timing:
                continue
            start_timestamp, end_timestamp = [t.strip() for t in timing.split("-->", 1)]
            text = " ".join(lines[2:])
            subtitles.append((start_timestamp, end_timestamp, text))
        return subtitles

    @staticmethod
    def parse_srt_to_items(srt_string: str) -> list[SubtitleItem]:
        content = srt_string.strip()
        blocks = [b.strip() for b in content.split("\n\n") if b.strip()]
        items: list[SubtitleItem] = []
        for block in blocks:
            lines = block.split("\n")
            if len(lines) < 3:
                continue
            try:
                idx = int(lines[0].strip())
            except ValueError:
                idx = None
            timing = lines[1].strip()
            if "-->" not in timing:
                continue
            start_str, end_str = [t.strip() for t in timing.split("-->", 1)]
            text = " ".join([line.strip() for line in lines[2:] if line.strip()])
            items.append(
                SubtitleItem(
                    index=idx,
                    start_time=start_str,
                    end_time=end_str,
                    start_sec=TimestampConverter.parse_timestamp(start_str),
                    end_sec=TimestampConverter.parse_timestamp(end_str),
                    text=text,
                )
            )
        return items


def scenes_to_srt_string(scenes: list[SceneSegment]) -> str:
    lines: list[str] = []
    for i, scene in enumerate(scenes, 1):
        lines.append(f"{i}")
        lines.append(f"{scene.start_time} --> {scene.end_time}")
        lines.append(" ".join(scene.subtitles))
        lines.append("")
    return "\n".join(lines)
