"""VideoQ multi-dimensional Otsu scene splitter."""

from __future__ import annotations

import logging

import numpy as np

from .embedders import SceneEmbedder, create_embedder
from ..srt import format_srt_time, parse_srt_scenes, parse_srt_timestamp
from .parsers import scenes_to_srt_string
from .types import SceneSegment

logger = logging.getLogger(__name__)


def l2_normalize(embeddings: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-12)
    return embeddings / norms


class SceneSplitter:
    """
    Splits SRT cues into semantic scenes by maximizing
    between-class variance of (L2-normalized) embeddings.
    """

    def __init__(self, batch_size: int = 16, embedder: SceneEmbedder | None = None):
        self.embedder = embedder or create_embedder(batch_size=batch_size)

    def _find_otsu_threshold(self, embeddings: np.ndarray) -> int:
        t = len(embeddings)
        if t < 2:
            return 0

        # Preserve input-precision accumulation; float64 results need no second array.
        cumulative_sum = np.cumsum(embeddings, axis=0).astype(np.float64, copy=False)
        total_sum = cumulative_sum[-1]

        max_criterion = -1.0
        best_tau = 1

        for tau in range(1, t):
            n0 = tau
            n1 = t - tau
            s0 = cumulative_sum[tau - 1]
            diff = s0 * t - n0 * total_sum
            criterion = float(np.sum(diff * diff) / (n0 * n1))
            if criterion > max_criterion:
                max_criterion = criterion
                best_tau = tau

        return best_tau

    def _split_long_text(
        self, encoded: list[int], start_timestamp: str, end_timestamp: str, max_tokens: int
    ) -> list[SceneSegment]:
        total_tokens = len(encoded)
        start_sec = parse_srt_timestamp(start_timestamp)
        duration = parse_srt_timestamp(end_timestamp) - start_sec

        scenes: list[SceneSegment] = []
        chunk_start = 0
        while chunk_start < total_tokens:
            chunk_end = min(chunk_start + max_tokens, total_tokens)
            while chunk_end > chunk_start:
                try:
                    chunk_text = self.embedder.encoding.decode(
                        encoded[chunk_start:chunk_end], errors="strict"
                    )
                    break
                except UnicodeDecodeError:
                    # Token boundaries can fall inside a UTF-8 character.
                    chunk_end -= 1
            else:
                raise ValueError("max_tokens is too small to preserve a Unicode character")

            chunk_start_sec = start_sec + duration * (chunk_start / total_tokens)
            chunk_end_sec = start_sec + duration * (chunk_end / total_tokens)

            scenes.append(
                SceneSegment(
                    start_time=format_srt_time(chunk_start_sec),
                    end_time=format_srt_time(chunk_end_sec),
                    subtitles=[chunk_text],
                )
            )
            chunk_start = chunk_end
        return scenes

    def process(self, srt_string: str, max_tokens: int = 512) -> str:
        if max_tokens <= 0:
            raise ValueError("max_tokens must be positive")
        raw_subs = parse_srt_scenes(srt_string)
        if not raw_subs:
            logger.info("Scene splitting skipped: no valid subtitle cues")
            return ""

        texts = [" ".join(cue.text.splitlines()) for cue in raw_subs]

        token_prefix = [0]
        long_text_scenes: dict[int, list[SceneSegment]] = {}
        for index, text in enumerate(texts):
            # Captions are literal text, including strings such as <|endoftext|>.
            encoded = self.embedder.encoding.encode_ordinary(text)
            token_prefix.append(token_prefix[-1] + len(encoded))
            if len(encoded) > max_tokens:
                long_text_scenes[index] = self._split_long_text(
                    encoded, raw_subs[index].start_time, raw_subs[index].end_time, max_tokens
                )
        del encoded
        embeddings: np.ndarray | None = None
        scenes: list[SceneSegment] = []
        pending = [(0, len(texts) - 1)]
        while pending:
            start, end = pending.pop()
            range_tokens = token_prefix[end + 1] - token_prefix[start]
            if start == end and range_tokens > max_tokens:
                scenes.extend(long_text_scenes.pop(start))
                continue
            if range_tokens <= max_tokens:
                scenes.append(
                    SceneSegment(
                        start_time=raw_subs[start].start_time,
                        end_time=raw_subs[end].end_time,
                        subtitles=texts[start : end + 1],
                    )
                )
                continue

            if end == start + 1:
                # Two over-budget cues have only one possible boundary.
                split_idx = end
            else:
                if embeddings is None:
                    embeddings = l2_normalize(self.embedder.get_embeddings(texts))
                split_idx = start + self._find_otsu_threshold(embeddings[start : end + 1])
            # Process the left range first without recursion or merging lists.
            pending.append((split_idx, end))
            pending.append((start, split_idx - 1))
        result = scenes_to_srt_string(scenes)
        # Whitespace-only token chunks do not form valid SRT cues.
        scene_count = sum(any(text.strip() for text in scene.subtitles) for scene in scenes)
        logger.info(
            "Scene splitting completed. Original: %s segments, Scenes: %s",
            len(raw_subs),
            scene_count,
        )
        return result
