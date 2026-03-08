from typing import List, Optional

import numpy as np
from sklearn.preprocessing import normalize

from .embedders import create_embedder
from .parsers import SubtitleParser, scenes_to_srt_string
from .types import SceneSegment
from .utils import TimestampConverter


class SceneSplitter:
    """
    Scene splitter for SRT subtitles using an optimized multi-dimensional Otsu method.
    Recursively splits subtitles into semantic scenes based on embedding variance.
    """

    def __init__(self, api_key: Optional[str] = None, batch_size: int = 16):
        self.embedder = create_embedder(api_key=api_key, batch_size=batch_size)
        self.timestamp_converter = TimestampConverter()

    def _find_otsu_threshold(self, embeddings: np.ndarray) -> int:
        """
        Find optimal split point using an optimized O(N) multi-dimensional Otsu method.
        """
        T = len(embeddings)
        if T < 2:
            return 0

        # Precompute cumulative sums for O(1) mean calculation
        # cumulative_sum[i] = sum(embeddings[:i])
        cumulative_sum = np.zeros((T + 1, embeddings.shape[1]))
        cumulative_sum[1:] = np.cumsum(embeddings, axis=0)

        total_sum = cumulative_sum[T]

        max_criterion = -1.0
        best_tau = 1

        # We want to maximize N0 * N1 * ||mu0 - mu1||^2
        # Which is equivalent to ||S0 * T - N0 * S_total||^2 / (N0 * N1)
        for tau in range(1, T):
            N0 = tau
            N1 = T - tau
            S0 = cumulative_sum[tau]

            # Vectorized calculation of (S0*T - N0*S_total)
            diff = S0 * T - N0 * total_sum
            criterion = np.sum(diff * diff) / (N0 * N1)

            if criterion > max_criterion:
                max_criterion = criterion
                best_tau = tau

        return best_tau

    def _split_long_text(
        self, text: str, start_timestamp: str, end_timestamp: str, max_tokens: int
    ) -> List[SceneSegment]:
        """Force split long text at token level if it exceeds max_tokens"""
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

        scenes = []
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

    def _calculate_token_prefix_sum(self, texts: List[str]) -> List[int]:
        token_prefix = [0]
        for t in texts:
            token_prefix.append(token_prefix[-1] + self.embedder.count_tokens(t))
        return token_prefix

    def _split_scene_recursive(
        self,
        embeddings: np.ndarray,
        texts: List[str],
        start_timestamps: List[str],
        end_timestamps: List[str],
        token_prefix: List[int],
        max_tokens: int,
        start: int,
        end: int,
    ) -> List[SceneSegment]:
        """Recursively split a range of subtitles"""
        range_tokens = token_prefix[end + 1] - token_prefix[start]

        # Case: Single subtitle exceeds limit
        if start == end and range_tokens > max_tokens:
            return self._split_long_text(
                texts[start], start_timestamps[start], end_timestamps[end], max_tokens
            )

        # Case: Within limit or atomic
        if range_tokens <= max_tokens or start == end:
            return [
                SceneSegment(
                    start_time=start_timestamps[start],
                    end_time=end_timestamps[end],
                    subtitles=texts[start : end + 1],
                )
            ]

        # Find optimal split and recurse
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

    def process(self, srt_string: str, max_tokens: int = 200) -> str:
        """Main entry point for processing SRT string"""
        raw_subs = SubtitleParser.parse_srt_string(srt_string)
        if not raw_subs:
            return ""

        texts = [t for _, _, t in raw_subs]
        start_times = [s for s, _, _ in raw_subs]
        end_times = [e for _, e, _ in raw_subs]

        # Get embeddings and normalize for cosine-similarity based Otsu
        embeds = self.embedder.get_embeddings(texts)
        embeds = normalize(embeds)

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
