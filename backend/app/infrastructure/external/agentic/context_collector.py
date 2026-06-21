"""Context ledger for RAGAS ``retrieved_contexts`` normalization (§10.1).

``ContextLedger`` accumulates the natural-language text fragments the LLM
actually saw during a single agentic chat turn (vector scenes, transcript
chunks, catalog summaries) and normalizes them into the
``retrieved_contexts: list[str]`` shape RAGAS expects.

The semantic contract of ``retrieved_contexts`` (``domain/evaluation/
gateways.py``) is unchanged; only its *meaning* is widened to "the list of
natural-language text fragments the LLM referenced when generating its
answer". Normalization rules (§10.1):

1. Transcript chunks are split into ~1500-char windows with 200-char overlap
   (passing a full transcript as a single element collapses faithfulness).
2. The catalog is kept as a single natural-language element; raw JSON is
   never stored (catalogs are not citation sources).
3. Duplicate elements are removed (order-preserving).
4. The result is capped at 30 elements total.

Pure infrastructure: no Django / DRF / external dependencies.
"""

from dataclasses import dataclass, field
from typing import List, Tuple

# Normalization tuning (§10.1).
_TRANSCRIPT_WINDOW_CHARS = 1500
_TRANSCRIPT_OVERLAP_CHARS = 200
_MAX_RETRIEVED_CONTEXTS = 30


@dataclass
class ContextLedger:
    """Accumulates and normalizes the LLM-visible context for evaluation.

    Attributes:
        vector_scenes: ``(video_id, text)`` pairs from ``search_scenes``.
        transcript_chunks: ``(video_id, text)`` pairs from ``get_video``
            (kept verbatim until ``to_retrieved_contexts`` windows them).
        catalog_summaries: Natural-language catalog summaries (never raw JSON).
    """

    vector_scenes: List[Tuple[int, str]] = field(default_factory=list)
    transcript_chunks: List[Tuple[int, str]] = field(default_factory=list)
    catalog_summaries: List[str] = field(default_factory=list)

    def add_vector_scene(self, video_id: int, text: str) -> None:
        """Record a vector-search scene fragment the LLM saw.

        Args:
            video_id: Owning video id.
            text: Scene body text.
        """
        if text and text.strip():
            self.vector_scenes.append((video_id, text))

    def add_transcript_chunk(self, video_id: int, text: str) -> None:
        """Record a transcript fragment the LLM saw (``get_video``).

        The text is stored verbatim here and split into windows only in
        ``to_retrieved_contexts``.

        Args:
            video_id: Owning video id.
            text: Transcript text (may be a full transcript).
        """
        if text and text.strip():
            self.transcript_chunks.append((video_id, text))

    def add_catalog(self, summary_text: str) -> None:
        """Record a catalog result as a natural-language summary.

        Catalogs are not citation sources; only a natural-language summary
        is stored (raw JSON must not be passed in).

        Args:
            summary_text: Natural-language catalog summary.
        """
        if summary_text and summary_text.strip():
            self.catalog_summaries.append(summary_text)

    def to_retrieved_contexts(self) -> List[str]:
        """Normalize accumulated context into the RAGAS ``retrieved_contexts``.

        Applies the §10.1 rules: window transcript chunks (~1500-char windows
        with 200-char overlap), keep each catalog as a single element, dedupe
        (order-preserving), and cap at 30 elements.

        Returns:
            The normalized list of natural-language text fragments.
        """
        elements: List[str] = []

        # 1. Vector scenes pass through as individual elements.
        for _video_id, text in self.vector_scenes:
            elements.append(text)

        # 2. Transcript chunks are split into overlapping windows.
        for _video_id, text in self.transcript_chunks:
            elements.extend(_split_into_windows(text))

        # 3. Catalogs are kept as single natural-language elements.
        for summary in self.catalog_summaries:
            elements.append(summary)

        # 4. Dedupe (order-preserving) and cap at the element limit.
        return _dedupe(elements)[:_MAX_RETRIEVED_CONTEXTS]


def _split_into_windows(text: str) -> List[str]:
    """Split ``text`` into ~1500-char windows with 200-char overlap.

    Args:
        text: The text to window.

    Returns:
        Non-empty windows in order. Text shorter than one window is returned
        as a single element.
    """
    stripped = text.strip()
    if not stripped:
        return []
    if len(stripped) <= _TRANSCRIPT_WINDOW_CHARS:
        return [stripped]

    step = _TRANSCRIPT_WINDOW_CHARS - _TRANSCRIPT_OVERLAP_CHARS
    windows: List[str] = []
    start = 0
    length = len(stripped)
    while start < length:
        window = stripped[start : start + _TRANSCRIPT_WINDOW_CHARS]
        if window.strip():
            windows.append(window)
        if start + _TRANSCRIPT_WINDOW_CHARS >= length:
            break
        start += step
    return windows


def _dedupe(elements: List[str]) -> List[str]:
    """Remove duplicate elements while preserving first-seen order.

    Args:
        elements: Candidate context elements.

    Returns:
        The order-preserving deduplicated list.
    """
    seen = set()
    result: List[str] = []
    for element in elements:
        if element not in seen:
            seen.add(element)
            result.append(element)
    return result
