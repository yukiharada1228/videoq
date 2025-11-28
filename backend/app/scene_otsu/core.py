from datetime import datetime
from typing import Any, Dict, List, Tuple

import numpy as np
import tiktoken
from openai import OpenAI
from sklearn.preprocessing import normalize
from tqdm import tqdm


class OpenAIEmbedder:
    def __init__(
        self, api_key: str, model: str = "text-embedding-3-small", batch_size: int = 16
    ):
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.batch_size = batch_size
        self.encoding = tiktoken.encoding_for_model(model)

    def count_tokens(self, text: str) -> int:
        """Accurately count tokens"""
        return len(self.encoding.encode(text))

    def get_embeddings(self, texts: List[str], max_tokens: int = 200) -> np.ndarray:
        all_embeddings = []
        for i in tqdm(
            range(0, len(texts), self.batch_size), desc="Generating embeddings"
        ):
            batch = texts[i : i + self.batch_size]
            response = self.client.embeddings.create(
                model=self.model,
                input=batch,
            )
            batch_embeds = [d.embedding for d in response.data]
            all_embeddings.append(np.array(batch_embeds))
        return np.vstack(all_embeddings)


class SubtitleParser:
    @staticmethod
    def parse_srt_string(srt_string: str) -> List[Tuple[str, str, str]]:
        """
        Parse SRT string

        Returns:
            [(start_timestamp, end_timestamp, text), ...]
        """
        content = srt_string.strip()
        blocks = content.split("\n\n")
        subtitles = []
        for block in blocks:
            lines = block.strip().split("\n")
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
    def parse_srt_scenes(srt_string: str) -> List[Dict[str, Any]]:
        """
        Convert SRT to scene-based dictionary
        Returns: [{index, start_time, end_time, start_sec, end_sec, text}]
        """
        content = srt_string.strip()
        blocks = [b.strip() for b in content.split("\n\n") if b.strip()]
        scenes: List[Dict[str, Any]] = []
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
            scenes.append(
                {
                    "index": idx,
                    "start_time": start_str,
                    "end_time": end_str,
                    "start_sec": SubtitleParser.parse_timestamp(start_str),
                    "end_sec": SubtitleParser.parse_timestamp(end_str),
                    "text": text,
                }
            )
        return scenes

    @staticmethod
    def parse_timestamp(timestamp: str) -> float:
        """
        Convert timestamp string (HH:MM:SS,mmm or HH:MM:SS) to seconds

        Args:
            timestamp: Timestamp string

        Returns:
            Seconds (float, including milliseconds)
        """
        parts = timestamp.split(",")
        t = datetime.strptime(parts[0], "%H:%M:%S")
        seconds = float(t.hour * 3600 + t.minute * 60 + t.second)
        if len(parts) > 1:
            milliseconds = int(parts[1])
            seconds += milliseconds / 1000.0
        return seconds


class TimestampConverter:
    """Handles timestamp conversions between seconds and SRT format"""

    @staticmethod
    def seconds_to_timestamp(seconds: float) -> str:
        """Convert seconds to timestamp in HH:MM:SS,mmm format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        milliseconds = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

    @staticmethod
    def calculate_duration(start_timestamp: str, end_timestamp: str) -> float:
        """Calculate duration in seconds between two timestamps"""
        start_sec = SubtitleParser.parse_timestamp(start_timestamp)
        end_sec = SubtitleParser.parse_timestamp(end_timestamp)
        return end_sec - start_sec


class SceneSplitter:
    """
    Scene splitter for SRT subtitles using Otsu method

    Recursively applies multi-dimensional Otsu method to split subtitle files into semantic scenes.
    """

    def __init__(
        self, api_key: str, model: str = "text-embedding-3-small", batch_size: int = 16
    ):
        """
        Args:
            api_key: OpenAI API key
            model: OpenAI embedding model to use
            batch_size: Batch size for embedding generation
        """
        self.embedder = OpenAIEmbedder(api_key, model, batch_size)
        self.timestamp_converter = TimestampConverter()

    def _create_chunk_scene(
        self, chunk_text: str, start_sec: float, end_sec: float
    ) -> Dict[str, Any]:
        """Create a scene dictionary from chunk information"""
        return {
            "start_time": self.timestamp_converter.seconds_to_timestamp(start_sec),
            "end_time": self.timestamp_converter.seconds_to_timestamp(end_sec),
            "subtitles": [chunk_text],
        }

    def _split_long_text(
        self, text: str, start_timestamp: str, end_timestamp: str, max_tokens: int
    ) -> List[Dict[str, Any]]:
        """
        Force split long text at token level

        Args:
            text: Text to split
            start_timestamp: Start timestamp
            end_timestamp: End timestamp
            max_tokens: Maximum token count

        Returns:
            List of split scene information
        """
        encoded = self.embedder.encoding.encode(text)
        total_tokens = len(encoded)

        if total_tokens <= max_tokens:
            return [
                {
                    "start_time": start_timestamp,
                    "end_time": end_timestamp,
                    "subtitles": [text],
                }
            ]

        # Calculate duration and prepare for chunking
        start_sec = SubtitleParser.parse_timestamp(start_timestamp)
        duration = self.timestamp_converter.calculate_duration(
            start_timestamp, end_timestamp
        )
        num_chunks = (total_tokens + max_tokens - 1) // max_tokens

        scenes = []
        for i in range(num_chunks):
            chunk_start = i * max_tokens
            chunk_end = min((i + 1) * max_tokens, total_tokens)
            chunk_text = self.embedder.encoding.decode(encoded[chunk_start:chunk_end])

            # Interpolate timestamps based on token position
            chunk_start_sec = start_sec + duration * (chunk_start / total_tokens)
            chunk_end_sec = start_sec + duration * (chunk_end / total_tokens)

            scenes.append(
                self._create_chunk_scene(chunk_text, chunk_start_sec, chunk_end_sec)
            )

        return scenes

    def _find_otsu_threshold(self, embeddings: np.ndarray) -> int:
        """
        Find optimal split point using multi-dimensional Otsu method

        Returns:
            best_split_index: Optimal split index
        """
        T = len(embeddings)
        max_criterion = float("-inf")
        best_tau = 1
        for tau in range(1, T):
            N0, N1 = tau, T - tau
            mu0 = np.mean(embeddings[:tau], axis=0)
            mu1 = np.mean(embeddings[tau:], axis=0)
            criterion = N0 * N1 * np.sum((mu0 - mu1) ** 2)
            if criterion > max_criterion:
                max_criterion = criterion
                best_tau = tau
        return best_tau

    def _calculate_token_prefix_sum(self, texts: List[str]) -> List[int]:
        """Pre-calculate cumulative token counts"""
        token_counts = [self.embedder.count_tokens(t) for t in texts]
        token_prefix = [0]
        for c in token_counts:
            token_prefix.append(token_prefix[-1] + c)
        return token_prefix

    def _get_range_token_count(
        self, token_prefix: List[int], start: int, end: int
    ) -> int:
        """Get token count for range [start, end] (both inclusive)"""
        return token_prefix[end + 1] - token_prefix[start]

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
    ) -> List[Dict[str, Any]]:
        """Recursively split a scene range"""
        token_count = self._get_range_token_count(token_prefix, start, end)

        # Force split if single subtitle exceeds max_tokens
        if start == end and token_count > max_tokens:
            return self._split_long_text(
                texts[start], start_timestamps[start], end_timestamps[end], max_tokens
            )

        # Termination: within token limit or cannot split further
        if token_count <= max_tokens or start == end:
            return [
                {
                    "start_time": start_timestamps[start],
                    "end_time": end_timestamps[end],
                    "subtitles": texts[start : end + 1],
                }
            ]

        # Find optimal split point and recurse
        segment = embeddings[start : end + 1]
        tau = self._find_otsu_threshold(segment)
        split_idx = start + tau

        left_scenes = self._split_scene_recursive(
            embeddings,
            texts,
            start_timestamps,
            end_timestamps,
            token_prefix,
            max_tokens,
            start,
            split_idx - 1,
        )
        right_scenes = self._split_scene_recursive(
            embeddings,
            texts,
            start_timestamps,
            end_timestamps,
            token_prefix,
            max_tokens,
            split_idx,
            end,
        )

        return left_scenes + right_scenes

    def _apply_otsu_recursive_split(
        self,
        embeddings: np.ndarray,
        texts: List[str],
        start_timestamps: List[str],
        end_timestamps: List[str],
        max_tokens: int,
    ) -> List[Dict[str, Any]]:
        """
        Recursively apply Otsu method to split scenes

        Returns:
            List of scene information
        """
        token_prefix = self._calculate_token_prefix_sum(texts)
        embeddings = normalize(embeddings)

        return self._split_scene_recursive(
            embeddings,
            texts,
            start_timestamps,
            end_timestamps,
            token_prefix,
            max_tokens,
            0,
            len(embeddings) - 1,
        )

    def process(self, srt_string: str, max_tokens: int = 200) -> str:
        """
        Process SRT string and return scene-split SRT string

        Args:
            srt_string: Input SRT string
            max_tokens: Maximum tokens per chunk

        Returns:
            Scene-split SRT string
        """
        subs = SubtitleParser.parse_srt_string(srt_string)
        texts = [t for _, _, t in subs]
        start_times = [start_ts for start_ts, _, _ in subs]
        end_times = [end_ts for _, end_ts, _ in subs]
        embeds = self.embedder.get_embeddings(texts, max_tokens)
        scenes = self._apply_otsu_recursive_split(
            embeds, texts, start_times, end_times, max_tokens
        )
        return scenes_to_srt_string(scenes)


def scenes_to_srt_string(scenes: List[Dict[str, Any]]) -> str:
    """Convert scene list to SRT format string"""
    lines = []
    subtitle_index = 1
    for scene in scenes:
        lines.append(f"{subtitle_index}")
        lines.append(f"{scene['start_time']} --> {scene['end_time']}")
        text = " ".join(scene["subtitles"])
        lines.append(text)
        lines.append("")
        subtitle_index += 1
    return "\n".join(lines)
