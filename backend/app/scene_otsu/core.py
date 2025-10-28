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
        # トークン数をチェックして警告を出す
        for i, text in enumerate(texts):
            token_count = self.count_tokens(text)
            if token_count > max_tokens:
                print(
                    f"⚠️  字幕 {i+1} のトークン数が {token_count} です（上限: {max_tokens}）"
                )

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
    def parse_srt_string(srt_string: str) -> List[Tuple[str, str]]:
        content = srt_string.strip()
        blocks = content.split("\n\n")
        subtitles = []
        for block in blocks:
            lines = block.strip().split("\n")
            if len(lines) < 3:
                continue
            timestamp = lines[1].split("-->")[0].strip()
            text = " ".join(lines[2:])
            subtitles.append((timestamp, text))
        return subtitles

    @staticmethod
    def parse_timestamp(timestamp: str) -> float:
        t = datetime.strptime(timestamp.split(",")[0], "%H:%M:%S")
        return t.hour * 3600 + t.minute * 60 + t.second


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

    def _find_otsu_threshold(self, embeddings: np.ndarray) -> Tuple[int, float]:
        """
        多次元Otsu法を使用して最適な分割点を求める

        Returns:
            (best_split_index, threshold): 最適な分割インデックスと閾値
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
        adaptive_threshold = max_criterion * 0.5
        return best_tau, adaptive_threshold

    def _apply_otsu_recursive_split(
        self, embeddings: np.ndarray, texts: List[str], timestamps: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Otsu法を再帰的に適用してシーンを分割

        Returns:
            シーン情報のリスト
        """

        def split_scene(start, end):
            if end - start <= 2:
                return [
                    {
                        "start_time": timestamps[start],
                        "end_time": timestamps[end],
                        "subtitles": texts[start : end + 1],
                    }
                ]
            segment = embeddings[start : end + 1]
            tau, thr = self._find_otsu_threshold(segment)
            N0, N1 = tau, len(segment) - tau
            mu0 = np.mean(segment[:tau], axis=0)
            mu1 = np.mean(segment[tau:], axis=0)
            criterion = N0 * N1 * np.sum((mu0 - mu1) ** 2)
            if criterion < thr or N0 < 3 or N1 < 3:
                return [
                    {
                        "start_time": timestamps[start],
                        "end_time": timestamps[end],
                        "subtitles": texts[start : end + 1],
                    }
                ]
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
        texts = [t for _, t in subs]
        times = [ts for ts, _ in subs]
        embeds = self.embedder.get_embeddings(texts, max_tokens)
        scenes = self._apply_otsu_recursive_split(embeds, texts, times)
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
