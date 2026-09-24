from __future__ import annotations

from .types import SceneSegment


def scenes_to_srt_string(scenes: list[SceneSegment]) -> str:
    lines: list[str] = []
    for i, scene in enumerate(scenes, 1):
        lines.append(f"{i}")
        lines.append(f"{scene.start_time} --> {scene.end_time}")
        lines.append(" ".join(scene.subtitles))
        lines.append("")
    return "\n".join(lines)
