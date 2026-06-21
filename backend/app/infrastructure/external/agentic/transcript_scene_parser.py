"""SRT transcript -> ``SceneRef`` parser for the agentic chat gateway (§8.2).

The ``get_video`` agent tool needs to turn a stored video transcript (which is
persisted in SRT format) into a list of time-stamped :class:`SceneRef` handles
so that individual cues can be cited and offered as seekable links. This module
provides :func:`parse_transcript_to_scenes`, the single entry point used by the
gateway.

It reuses the shared SRT helpers in ``app.infrastructure.scene_otsu`` and
``app.infrastructure.transcription`` (same infrastructure layer, so the import
is allowed). The SRT timestamp validation regex itself lives in the
``presentation`` layer (``app/presentation/video/serializers.py``), which
infrastructure must not import; it is therefore duplicated here as
:data:`_SRT_TIMESTAMP_RE`.
"""

import re
from typing import List

from app.infrastructure.external.agentic.scene_ref import SceneRef
from app.infrastructure.scene_otsu.parsers import SubtitleParser
from app.infrastructure.scene_otsu.utils import TimestampConverter
from app.infrastructure.transcription.srt_processing import format_time_for_srt

# Duplicated from app/presentation/video/serializers.py:_SRT_TIMESTAMP_RE.
# Infrastructure must not import the presentation layer, so the SRT timing-line
# pattern (``HH:MM:SS,mmm --> HH:MM:SS,mmm``) is mirrored locally.
_SRT_TIMESTAMP_RE = re.compile(
    r"^\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}$"
)


def _looks_like_srt(transcript: str) -> bool:
    """Return True when ``transcript`` has at least one valid SRT block.

    A valid block is a numeric index line, a timing line matching
    :data:`_SRT_TIMESTAMP_RE`, followed by one or more text lines.

    Args:
        transcript: Candidate transcript text.

    Returns:
        ``True`` if at least one well-formed SRT block is present.
    """
    blocks = [b.strip() for b in transcript.split("\n\n") if b.strip()]
    for block in blocks:
        lines = block.split("\n")
        if len(lines) < 3:
            continue
        try:
            int(lines[0].strip())
        except ValueError:
            continue
        if _SRT_TIMESTAMP_RE.match(lines[1].strip()):
            return True
    return False


def _normalize_srt_time(timestamp: str, fallback_sec: float) -> str:
    """Render a numeric second value as a canonical SRT timestamp.

    The raw timestamp from the SRT is re-derived from its parsed seconds via
    :func:`format_time_for_srt` so the emitted ``start_time``/``end_time`` are
    always canonical ``HH:MM:SS,mmm`` strings, regardless of minor formatting
    differences in the source cue.

    Args:
        timestamp: Original timestamp string from the SRT timing line.
        fallback_sec: Parsed seconds for ``timestamp`` (already computed by the
            caller) used to format the canonical string.

    Returns:
        A canonical ``HH:MM:SS,mmm`` SRT timestamp string.
    """
    return format_time_for_srt(fallback_sec)


def parse_transcript_to_scenes(
    transcript: str, *, video_id: int, video_title: str
) -> List[SceneRef]:
    """Parse an SRT transcript into ``SceneRef`` handles (``source="transcript"``).

    Each well-formed SRT block becomes one :class:`SceneRef` with canonical
    ``start_time``/``end_time`` strings, numeric ``start_sec``/``end_sec``, and a
    ``scene_index`` equal to the block's positional index (0-based).

    If the transcript is empty, not in SRT format, or otherwise corrupt, a
    single fallback :class:`SceneRef` is returned with all time/index fields set
    to ``None`` and ``text`` holding the entire transcript. This keeps the
    content usable for summarization while the frontend hides the (absent) seek
    link.

    Args:
        transcript: Stored transcript text, expected in SRT format.
        video_id: Owning video id (keyword-only).
        video_title: Video title for citation rendering (keyword-only).

    Returns:
        A list of :class:`SceneRef`, one per SRT block, or a single fallback
        ``SceneRef`` when the input cannot be parsed as SRT.
    """
    text = transcript or ""

    if not text.strip() or not _looks_like_srt(text):
        return [
            SceneRef(
                video_id=video_id,
                video_title=video_title,
                start_time=None,
                end_time=None,
                start_sec=None,
                end_sec=None,
                scene_index=None,
                text=text,
                source="transcript",
            )
        ]

    items = SubtitleParser.parse_srt_to_items(text)
    if not items:
        return [
            SceneRef(
                video_id=video_id,
                video_title=video_title,
                start_time=None,
                end_time=None,
                start_sec=None,
                end_sec=None,
                scene_index=None,
                text=text,
                source="transcript",
            )
        ]

    scenes: List[SceneRef] = []
    for block_index, item in enumerate(items):
        try:
            start_sec = (
                item.start_sec
                if item.start_sec is not None
                else TimestampConverter.parse_timestamp(item.start_time)
            )
            end_sec = (
                item.end_sec
                if item.end_sec is not None
                else TimestampConverter.parse_timestamp(item.end_time)
            )
        except (ValueError, TypeError):
            # A single malformed cue should not poison the whole transcript;
            # emit it without time/index so it stays usable for summary.
            scenes.append(
                SceneRef(
                    video_id=video_id,
                    video_title=video_title,
                    start_time=None,
                    end_time=None,
                    start_sec=None,
                    end_sec=None,
                    scene_index=None,
                    text=item.text or "",
                    source="transcript",
                )
            )
            continue

        scenes.append(
            SceneRef(
                video_id=video_id,
                video_title=video_title,
                start_time=_normalize_srt_time(item.start_time, start_sec),
                end_time=_normalize_srt_time(item.end_time, end_sec),
                start_sec=start_sec,
                end_sec=end_sec,
                scene_index=block_index,
                text=item.text or "",
                source="transcript",
            )
        )

    return scenes
