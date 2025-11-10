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
        """トークン数を正確にカウント"""
        return len(self.encoding.encode(text))

    def get_embeddings(self, texts: List[str], max_tokens: int = 200) -> np.ndarray:
        all_embeddings = []
        for i in tqdm(range(0, len(texts), self.batch_size), desc="Embedding生成中"):
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
        SRT文字列を解析

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
        SRTをシーン単位の辞書へ変換
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
        タイムスタンプ文字列（HH:MM:SS,mmmまたはHH:MM:SS）を秒数に変換

        Args:
            timestamp: タイムスタンプ文字列

        Returns:
            秒数（float、ミリ秒を含む）
        """
        parts = timestamp.split(",")
        t = datetime.strptime(parts[0], "%H:%M:%S")
        seconds = float(t.hour * 3600 + t.minute * 60 + t.second)
        if len(parts) > 1:
            milliseconds = int(parts[1])
            seconds += milliseconds / 1000.0
        return seconds


class SceneSplitter:
    """
    Otsu法を使用したSRT字幕のシーン分割器

    多次元Otsu法を再帰的に適用して、字幕ファイルを意味的なシーンに分割します。
    """

    def __init__(
        self, api_key: str, model: str = "text-embedding-3-small", batch_size: int = 16
    ):
        """
        Args:
            api_key: OpenAI APIキー
            model: 使用するOpenAI embeddingモデル
            batch_size: embedding生成のバッチサイズ
        """
        self.embedder = OpenAIEmbedder(api_key, model, batch_size)

    def _seconds_to_timestamp(self, seconds: float) -> str:
        """秒数をHH:MM:SS,mmm形式のタイムスタンプに変換"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        milliseconds = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

    def _split_long_text(
        self, text: str, start_timestamp: str, end_timestamp: str, max_tokens: int
    ) -> List[Dict[str, Any]]:
        """
        長いテキストをトークンレベルで強制分割

        Args:
            text: 分割対象のテキスト
            start_timestamp: 開始タイムスタンプ
            end_timestamp: 終了タイムスタンプ
            max_tokens: 最大トークン数

        Returns:
            分割されたシーン情報のリスト
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

        # タイムスタンプを秒数に変換
        start_sec = SubtitleParser.parse_timestamp(start_timestamp)
        end_sec = SubtitleParser.parse_timestamp(end_timestamp)
        duration = end_sec - start_sec

        scenes = []
        num_chunks = (total_tokens + max_tokens - 1) // max_tokens  # 切り上げ

        for i in range(num_chunks):
            chunk_start = i * max_tokens
            chunk_end = min((i + 1) * max_tokens, total_tokens)
            chunk_tokens = encoded[chunk_start:chunk_end]
            chunk_text = self.embedder.encoding.decode(chunk_tokens)

            # タイムスタンプを線形補間
            chunk_start_ratio = chunk_start / total_tokens
            chunk_end_ratio = chunk_end / total_tokens
            chunk_start_sec = start_sec + duration * chunk_start_ratio
            chunk_end_sec = start_sec + duration * chunk_end_ratio

            # 秒数をタイムスタンプ文字列に変換
            chunk_start_ts = self._seconds_to_timestamp(chunk_start_sec)
            chunk_end_ts = self._seconds_to_timestamp(chunk_end_sec)

            scenes.append(
                {
                    "start_time": chunk_start_ts,
                    "end_time": chunk_end_ts,
                    "subtitles": [chunk_text],
                }
            )

        return scenes

    def _find_otsu_threshold(self, embeddings: np.ndarray) -> int:
        """
        多次元Otsu法を使用して最適な分割点を求める

        Returns:
            best_split_index: 最適な分割インデックス
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

    def _apply_otsu_recursive_split(
        self,
        embeddings: np.ndarray,
        texts: List[str],
        start_timestamps: List[str],
        end_timestamps: List[str],
        max_tokens: int,
    ) -> List[Dict[str, Any]]:
        """
        Otsu法を再帰的に適用してシーンを分割

        Returns:
            シーン情報のリスト
        """

        # 字幕ごとのトークン数と累積和を事前計算
        token_counts = [self.embedder.count_tokens(t) for t in texts]
        token_prefix = [0]
        for c in token_counts:
            token_prefix.append(token_prefix[-1] + c)

        def range_tokens(s: int, e: int) -> int:
            # [s, e] のトークン数を返す（両端含む）
            return token_prefix[e + 1] - token_prefix[s]

        def split_scene(start, end):
            token_count = range_tokens(start, end)

            # 単一字幕がmax_tokensを超える場合は強制分割
            if start == end and token_count > max_tokens:
                return self._split_long_text(
                    texts[start],
                    start_timestamps[start],
                    end_timestamps[end],
                    max_tokens,
                )

            # 終了条件: チャンクの合計トークン数が閾値以内、または分割不能（かつmax_tokens以内）
            if token_count <= max_tokens or start == end:
                return [
                    {
                        "start_time": start_timestamps[start],
                        "end_time": end_timestamps[end],
                        "subtitles": texts[start : end + 1],
                    }
                ]
            segment = embeddings[start : end + 1]
            tau = self._find_otsu_threshold(segment)
            split_idx = start + tau
            return split_scene(start, split_idx - 1) + split_scene(split_idx, end)

        embeddings = normalize(embeddings)
        return split_scene(0, len(embeddings) - 1)

    def process(self, srt_string: str, max_tokens: int = 200) -> str:
        """
        SRT文字列を処理してシーン分割されたSRT文字列を返す

        Args:
            srt_string: 入力SRT文字列
            max_tokens: チャンクあたりの最大トークン数

        Returns:
            シーン分割されたSRT文字列
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
    """シーンリストをSRT形式の文字列に変換"""
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
