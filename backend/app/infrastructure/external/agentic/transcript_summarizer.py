"""Map-reduce transcript summarizer for the ``get_video`` tool (§7.2.1).

When a transcript is too large to inline verbatim (over
``TRANSCRIPT_INLINE_TOKEN_LIMIT`` tokens), the ``get_video`` tool returns a
map-reduce summary instead of the raw SRT. This module:

* Splits an SRT transcript into token-bounded chunks at cue boundaries
  (:func:`chunk_transcript_srt`), measuring chunk size with the single shared
  :func:`count_tokens` so the accounting matches every other token limit.
* Summarizes those chunks into a :class:`VideoSummary` via an injected
  LangChain chat model (:func:`map_reduce_summarize`): a *map* step summarizes
  each chunk into 2-3 sentences, and a *reduce* step combines them into an
  overall summary plus per-section summaries with SRT-format time spans.
* Renders a :class:`VideoSummary` into the ``get_video`` ToolMessage JSON shape
  (:func:`render_video_summary`).

Section time spans are SRT strings (``HH:MM:SS,mmm``) so the agent can derive
``[n]`` citations from the summary itself. The ``llm`` is injected for
deterministic-friendly testing. Very long transcripts (more than
``SUMMARIZE_MAX_CHUNKS`` chunks) fall back to a coarse chapter-header-only
summary that does not invoke the LLM per chunk; pinpoint detail is then left to
the ``search_scenes`` tool.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.infrastructure.external.agentic.agent_config import SUMMARIZE_MAX_CHUNKS
from app.infrastructure.external.agentic.token_counter import count_tokens
from app.infrastructure.scene_otsu.parsers import SubtitleParser
from app.infrastructure.transcription.srt_processing import format_time_for_srt

logger = logging.getLogger(__name__)


@dataclass
class TranscriptChunk:
    """A token-bounded contiguous slice of an SRT transcript.

    Attributes:
        start_time: SRT-format start ``HH:MM:SS,mmm`` of the first cue.
        end_time: SRT-format end ``HH:MM:SS,mmm`` of the last cue.
        start_sec: Numeric start seconds of the first cue.
        end_sec: Numeric end seconds of the last cue.
        text: Concatenated cue text for the chunk.
    """

    start_time: str
    end_time: str
    start_sec: float
    end_sec: float
    text: str


@dataclass
class VideoSummary:
    """A map-reduce summary of a single video transcript (§7.2.1).

    Attributes:
        video_id: Owning video id.
        title: Video title.
        overall_summary: A short high-level summary of the whole transcript.
        sections: Per-section summaries. Each item is a dict with keys
            ``start_time`` / ``end_time`` (SRT strings) and ``summary``.
    """

    video_id: int
    title: str
    overall_summary: str
    sections: List[Dict[str, str]] = field(default_factory=list)


def chunk_transcript_srt(
    srt_text: str, max_chunk_tokens: int = 1500
) -> List[TranscriptChunk]:
    """Split an SRT transcript into token-bounded chunks at cue boundaries.

    Cues are parsed with the shared :class:`SubtitleParser` and greedily merged
    into chunks. A chunk is closed once adding the next cue would push it past
    ``max_chunk_tokens`` (measured with :func:`count_tokens`). A single cue that
    already exceeds the budget on its own becomes a chunk of its own (cues are
    never split mid-cue, since they are the smallest citable boundary).

    Args:
        srt_text: The raw SRT transcript.
        max_chunk_tokens: Soft upper bound on tokens per chunk.

    Returns:
        A list of :class:`TranscriptChunk` in transcript order. Empty when the
        SRT contains no parseable cues.
    """
    items = SubtitleParser.parse_srt_to_items(srt_text)
    if not items:
        return []

    chunks: List[TranscriptChunk] = []
    cur_texts: List[str] = []
    cur_start_sec: Optional[float] = None
    cur_end_sec: Optional[float] = None
    cur_tokens = 0

    def _flush() -> None:
        nonlocal cur_texts, cur_start_sec, cur_end_sec, cur_tokens
        if not cur_texts:
            return
        start_sec = cur_start_sec or 0.0
        end_sec = cur_end_sec or 0.0
        chunks.append(
            TranscriptChunk(
                # Normalize to canonical SRT format (HH:MM:SS,mmm) from the
                # numeric seconds so downstream citations are consistent even if
                # the source SRT used "." millisecond separators.
                start_time=format_time_for_srt(start_sec),
                end_time=format_time_for_srt(end_sec),
                start_sec=start_sec,
                end_sec=end_sec,
                text=" ".join(cur_texts).strip(),
            )
        )
        cur_texts = []
        cur_start_sec = None
        cur_end_sec = None
        cur_tokens = 0

    for item in items:
        text = (item.text or "").strip()
        if not text:
            continue
        item_tokens = count_tokens(text)
        # Close the current chunk before adding a cue that would overflow it,
        # unless the chunk is still empty (a lone oversized cue still forms one
        # chunk rather than being dropped or split).
        if cur_texts and cur_tokens + item_tokens > max_chunk_tokens:
            _flush()

        if not cur_texts:
            cur_start_sec = item.start_sec
        cur_texts.append(text)
        cur_end_sec = item.end_sec
        cur_tokens += item_tokens

    _flush()
    return chunks


# --- Prompt builders (kept module-level so tests can inspect them) ---

_MAP_SYSTEM = (
    "You are summarizing a section of a video transcript. Produce a concise "
    "2-3 sentence summary of the section's key points. Do not add information "
    "that is not in the transcript."
)

_REDUCE_SYSTEM = (
    "You are combining section summaries of a video transcript into one overall "
    "summary. Produce a short, faithful high-level summary (a few sentences) of "
    "the whole video. Do not invent details."
)


def _locale_instruction(locale: Optional[str]) -> str:
    """Return a one-line language directive for the LLM, or empty string."""
    if not locale:
        return ""
    return f"\nRespond in the language identified by the locale code: {locale}."


def _extract_text(response: Any) -> str:
    """Pull plain text out of a LangChain chat-model response.

    Handles both ``AIMessage``-like objects (``.content``) and bare strings, and
    coalesces list-style structured content into a single string.
    """
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for piece in content:
            if isinstance(piece, str):
                parts.append(piece)
            elif isinstance(piece, dict):
                parts.append(str(piece.get("text", "")))
        return " ".join(p for p in parts if p).strip()
    return str(content).strip()


def _coarse_summary(
    chunks: List[TranscriptChunk],
    *,
    video_id: int,
    title: str,
    max_chunks: int,
) -> VideoSummary:
    """Build a chapter-header-only summary without per-chunk LLM calls (§7.2.1).

    Used when the transcript has more chunks than the LLM budget allows. The
    chunks are bucketed into at most ``max_chunks`` evenly sized chapters; each
    chapter records only its SRT time span and a truncated text snippet. Callers
    are told that pinpoint detail is available via ``search_scenes``.
    """
    n = len(chunks)
    # Number of buckets is capped at max_chunks; spread chunks evenly across them.
    bucket_count = max(1, min(max_chunks, n))
    per_bucket = (n + bucket_count - 1) // bucket_count  # ceil

    sections: List[Dict[str, str]] = []
    for i in range(0, n, per_bucket):
        bucket = chunks[i : i + per_bucket]
        snippet = " ".join(c.text for c in bucket).strip()
        # Keep chapter headers short; they are signposts, not full summaries.
        if len(snippet) > 200:
            snippet = snippet[:200].rstrip() + "…"
        sections.append(
            {
                "start_time": bucket[0].start_time,
                "end_time": bucket[-1].end_time,
                "summary": snippet,
            }
        )

    overall = (
        "This transcript is long, so only a coarse chapter outline is provided. "
        "Use the search_scenes tool for pinpoint detail within any chapter."
    )
    return VideoSummary(
        video_id=video_id,
        title=title,
        overall_summary=overall,
        sections=sections,
    )


def map_reduce_summarize(
    chunks: List[TranscriptChunk],
    llm: Any,
    *,
    video_id: int,
    title: str,
    locale: Optional[str] = None,
    target_tokens: int = 1200,
    max_chunks: int = SUMMARIZE_MAX_CHUNKS,
) -> VideoSummary:
    """Summarize transcript chunks into a :class:`VideoSummary` (§7.2.1).

    Map step: each chunk is summarized to 2-3 sentences via ``llm.invoke``.
    Reduce step: the section summaries are combined into an overall summary; the
    per-section summaries (with SRT time spans) become ``VideoSummary.sections``
    so citations can be derived from the summary.

    If ``len(chunks) > max_chunks`` the function falls back to a coarse
    chapter-header-only summary (see :func:`_coarse_summary`) and does *not*
    call the LLM per chunk, leaving pinpoint detail to ``search_scenes``.

    Args:
        chunks: Token-bounded transcript chunks (from
            :func:`chunk_transcript_srt`).
        llm: An injected LangChain chat model exposing ``invoke(messages)``.
        video_id: Owning video id.
        title: Video title.
        locale: Optional BCP-47-ish locale code steering the response language.
        target_tokens: Soft target size (tokens) for the combined overall
            summary; oversized reduce input is trimmed to roughly this budget.
        max_chunks: Threshold above which the coarse fallback is used.

    Returns:
        A :class:`VideoSummary`. Sections carry SRT-format ``start_time`` /
        ``end_time`` strings.
    """
    if not chunks:
        return VideoSummary(
            video_id=video_id,
            title=title,
            overall_summary="",
            sections=[],
        )

    if len(chunks) > max_chunks:
        logger.info(
            "Transcript for video %s has %d chunks (> max_chunks=%d); using "
            "coarse chapter-only summary.",
            video_id,
            len(chunks),
            max_chunks,
        )
        return _coarse_summary(
            chunks, video_id=video_id, title=title, max_chunks=max_chunks
        )

    locale_hint = _locale_instruction(locale)

    # --- Map step: summarize each chunk into 2-3 sentences. ---
    sections: List[Dict[str, str]] = []
    for chunk in chunks:
        messages = [
            SystemMessage(content=_MAP_SYSTEM + locale_hint),
            HumanMessage(
                content=(
                    f"Section time span: {chunk.start_time} --> {chunk.end_time}\n"
                    f"Transcript:\n{chunk.text}"
                )
            ),
        ]
        try:
            response = llm.invoke(messages)
            summary_text = _extract_text(response)
        except Exception:  # pragma: no cover - defensive; llm is injected
            logger.warning(
                "Map-step summarization failed for video %s section %s-%s; "
                "falling back to truncated raw text.",
                video_id,
                chunk.start_time,
                chunk.end_time,
                exc_info=True,
            )
            summary_text = chunk.text[:300].strip()
        sections.append(
            {
                "start_time": chunk.start_time,
                "end_time": chunk.end_time,
                "summary": summary_text,
            }
        )

    # --- Reduce step: combine section summaries into an overall summary. ---
    combined = "\n".join(
        f"[{s['start_time']} --> {s['end_time']}] {s['summary']}" for s in sections
    )
    # Keep the reduce input within roughly target_tokens; the reduce prompt only
    # needs the section summaries, which are already short.
    if count_tokens(combined) > target_tokens:
        logger.debug(
            "Reduce input for video %s exceeds target_tokens=%d; the model "
            "will receive all section summaries regardless.",
            video_id,
            target_tokens,
        )

    reduce_messages = [
        SystemMessage(content=_REDUCE_SYSTEM + locale_hint),
        HumanMessage(content=f"Video title: {title}\n\nSection summaries:\n{combined}"),
    ]
    try:
        reduce_response = llm.invoke(reduce_messages)
        overall_summary = _extract_text(reduce_response)
    except Exception:  # pragma: no cover - defensive; llm is injected
        logger.warning(
            "Reduce-step summarization failed for video %s; using concatenated "
            "section summaries as overall summary.",
            video_id,
            exc_info=True,
        )
        overall_summary = " ".join(s["summary"] for s in sections).strip()

    return VideoSummary(
        video_id=video_id,
        title=title,
        overall_summary=overall_summary,
        sections=sections,
    )


def render_video_summary(summary: VideoSummary) -> Dict[str, Any]:
    """Render a :class:`VideoSummary` as the ``get_video`` ToolMessage JSON (§7.2.1).

    Produces::

        {"video_id": 123, "title": "...", "overall_summary": "...",
         "sections": [{"start_time": "...", "end_time": "...", "summary": "..."}]}

    Args:
        summary: The summary to render.

    Returns:
        A JSON-serializable dict in the §7.2.1 ToolMessage shape.
    """
    return {
        "video_id": summary.video_id,
        "title": summary.title,
        "overall_summary": summary.overall_summary,
        "sections": [
            {
                "start_time": section.get("start_time", ""),
                "end_time": section.get("end_time", ""),
                "summary": section.get("summary", ""),
            }
            for section in summary.sections
        ],
    }
