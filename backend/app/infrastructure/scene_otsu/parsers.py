from typing import Any, Dict, List, Tuple

from .types import SceneSegment, SubtitleItem
from .utils import TimestampConverter


class SubtitleParser:
    @staticmethod
    def parse_srt_string(srt_string: str) -> List[Tuple[str, str, str]]:
        """
        Parse SRT string to minimal tuple format
        Returns: [(start_timestamp, end_timestamp, text), ...]
        """
        content = srt_string.strip()
        blocks = [b.strip() for b in content.split("\n\n") if b.strip()]
        subtitles = []
        for block in blocks:
            lines = block.split("\n")
            if len(lines) < 3:
                continue
            timing = lines[1].strip()
            if "-->" not in timing:
                continue
            start_timestamp, end_timestamp = [t.strip() for t in timing.split("-->")]
            text = " ".join(lines[2:])
            subtitles.append((start_timestamp, end_timestamp, text))
        return subtitles

    @staticmethod
    def parse_srt_to_items(srt_string: str) -> List[SubtitleItem]:
        """
        Convert SRT to list of SubtitleItem dataclasses
        """
        content = srt_string.strip()
        blocks = [b.strip() for b in content.split("\n\n") if b.strip()]
        items: List[SubtitleItem] = []
        for block in blocks:
            lines = block.split("\n")
            if len(lines) < 3:
                continue
            try:
                idx = int(lines[0].strip())
            except Exception:
                idx = None
            timing = lines[1].strip()
            if "-->" not in timing:
                continue
            start_str, end_str = [t.strip() for t in timing.split("-->")]
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

    @staticmethod
    def parse_srt_scenes(srt_string: str) -> List[Dict[str, Any]]:
        """
        Convert SRT to scene-based dictionary for backward compatibility.
        Returns: [{index, start_time, end_time, start_sec, end_sec, text}]
        """
        items = SubtitleParser.parse_srt_to_items(srt_string)
        return [
            {
                "index": item.index,
                "start_time": item.start_time,
                "end_time": item.end_time,
                "start_sec": item.start_sec,
                "end_sec": item.end_sec,
                "text": item.text,
            }
            for item in items
        ]


def scenes_to_srt_string(scenes: List[SceneSegment]) -> str:
    """Convert scene list to SRT format string"""
    lines = []
    for i, scene in enumerate(scenes, 1):
        lines.append(f"{i}")
        lines.append(f"{scene.start_time} --> {scene.end_time}")
        text = " ".join(scene.subtitles)
        lines.append(text)
        lines.append("")
    return "\n".join(lines)
