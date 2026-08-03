"""Multi-dimensional Otsu scene splitter (ported from Django scene_otsu)."""

from __future__ import annotations

import numpy as np

from .embedders import SceneEmbedder, create_embedder
from .parsers import SubtitleParser, scenes_to_srt_string
from .types import SceneSegment
from .utils import TimestampConverter


def l2_normalize(embeddings: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-12)
    return embeddings / norms


class SceneSplitter:
    """
    Recursively splits SRT cues into semantic scenes by maximizing
    between-class variance of (L2-normalized) embeddings.
    """

    def __init__(self, batch_size: int = 16, embedder: SceneEmbedder | None = None):
        self.embedder = embedder or create_embedder(batch_size=batch_size)
        self.timestamp_converter = TimestampConverter()

    def _find_otsu_threshold(self, embeddings: np.ndarray) -> int:
        t = len(embeddings)
        if t < 2:
            return 0

        cumulative_sum = np.zeros((t + 1, embeddings.shape[1]), dtype=np.float64)
        cumulative_sum[1:] = np.cumsum(embeddings, axis=0)
        total_sum = cumulative_sum[t]

        max_criterion = -1.0
        best_tau = 1

        for tau in range(1, t):
            n0 = tau
            n1 = t - tau
            s0 = cumulative_sum[tau]
            diff = s0 * t - n0 * total_sum
            criterion = float(np.sum(diff * diff) / (n0 * n1))
            if criterion > max_criterion:
                max_criterion = criterion
                best_tau = tau

        return best_tau

    def _split_long_text(
        self, text: str, start_timestamp: str, end_timestamp: str, max_tokens: int
    ) -> list[SceneSegment]:
        encoded = self.embedder.encoding.encode(text)
        total_tokens = len(encoded)

        if total_tokens <= max_tokens:
            return [
                SceneSegment(
                    start_time=start_timestamp,
                    end_time=end_timestamp,
                    subtitles=[text],
                )
            ]

        start_sec = TimestampConverter.parse_timestamp(start_timestamp)
        duration = self.timestamp_converter.calculate_duration(
            start_timestamp, end_timestamp
        )
        num_chunks = (total_tokens + max_tokens - 1) // max_tokens

        scenes: list[SceneSegment] = []
        for i in range(num_chunks):
            chunk_start = i * max_tokens
            chunk_end = min((i + 1) * max_tokens, total_tokens)
            chunk_text = self.embedder.encoding.decode(encoded[chunk_start:chunk_end])

            chunk_start_sec = start_sec + duration * (chunk_start / total_tokens)
            chunk_end_sec = start_sec + duration * (chunk_end / total_tokens)

            scenes.append(
                SceneSegment(
                    start_time=self.timestamp_converter.seconds_to_timestamp(
                        chunk_start_sec
                    ),
                    end_time=self.timestamp_converter.seconds_to_timestamp(
                        chunk_end_sec
                    ),
                    subtitles=[chunk_text],
                )
            )
        return scenes

    def _calculate_token_prefix_sum(self, texts: list[str]) -> list[int]:
        token_prefix = [0]
        for t in texts:
            token_prefix.append(token_prefix[-1] + self.embedder.count_tokens(t))
        return token_prefix

    def _split_scene_recursive(
        self,
        embeddings: np.ndarray,
        texts: list[str],
        start_timestamps: list[str],
        end_timestamps: list[str],
        token_prefix: list[int],
        max_tokens: int,
        start: int,
        end: int,
    ) -> list[SceneSegment]:
        range_tokens = token_prefix[end + 1] - token_prefix[start]

        if start == end and range_tokens > max_tokens:
            return self._split_long_text(
                texts[start], start_timestamps[start], end_timestamps[end], max_tokens
            )

        if range_tokens <= max_tokens or start == end:
            return [
                SceneSegment(
                    start_time=start_timestamps[start],
                    end_time=end_timestamps[end],
                    subtitles=texts[start : end + 1],
                )
            ]

        segment_embeddings = embeddings[start : end + 1]
        tau = self._find_otsu_threshold(segment_embeddings)
        split_idx = start + tau

        left = self._split_scene_recursive(
            embeddings,
            texts,
            start_timestamps,
            end_timestamps,
            token_prefix,
            max_tokens,
            start,
            split_idx - 1,
        )
        right = self._split_scene_recursive(
            embeddings,
            texts,
            start_timestamps,
            end_timestamps,
            token_prefix,
            max_tokens,
            split_idx,
            end,
        )
        return left + right

    def process(self, srt_string: str, max_tokens: int = 512) -> str:
        raw_subs = SubtitleParser.parse_srt_string(srt_string)
        if not raw_subs:
            return ""

        texts = [t for _, _, t in raw_subs]
        start_times = [s for s, _, _ in raw_subs]
        end_times = [e for _, e, _ in raw_subs]

        embeds = self.embedder.get_embeddings(texts)
        embeds = l2_normalize(embeds)

        token_prefix = self._calculate_token_prefix_sum(texts)
        scenes = self._split_scene_recursive(
            embeds,
            texts,
            start_times,
            end_times,
            token_prefix,
            max_tokens,
            0,
            len(texts) - 1,
        )
        return scenes_to_srt_string(scenes)
