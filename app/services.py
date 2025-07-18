from .models import VideoGroup
from openai import OpenAI
from pgvector.django import CosineDistance
import tiktoken


def count_tokens(text: str, model: str = "text-embedding-3-small") -> int:
    """
    テキストのトークン数をカウントする
    """
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except Exception as e:
        print(f"Error counting tokens: {e}")
        # フォールバック: 概算（英語なら4文字=1トークン、日本語なら1文字=1トークン）
        return len(text) // 4


def truncate_text_to_token_limit(
    text: str, max_tokens: int = 8000, model: str = "text-embedding-3-small"
) -> str:
    """
    テキストをトークン制限内に収める（改善版）
    """
    if count_tokens(text, model) <= max_tokens:
        return text

    # トークン数を超えている場合、テキストを短縮
    encoding = tiktoken.encoding_for_model(model)
    tokens = encoding.encode(text)

    if len(tokens) > max_tokens:
        # より良い短縮方法：先頭と末尾の両方を保持
        front_tokens = tokens[: max_tokens // 2]  # 前半部分
        back_tokens = tokens[-(max_tokens // 2) :]  # 後半部分

        # 重複を避けて結合
        if len(front_tokens) + len(back_tokens) > max_tokens:
            # 重複が大きい場合は先頭部分のみ使用
            truncated_tokens = tokens[:max_tokens]
            truncated_text = encoding.decode(truncated_tokens)
        else:
            # 先頭と末尾を結合
            truncated_text = (
                encoding.decode(front_tokens) + "..." + encoding.decode(back_tokens)
            )

        print(
            f"Text truncated from {len(tokens)} to {count_tokens(truncated_text)} tokens"
        )
        return truncated_text

    return text


class VectorSearchService:
    """Django+pgvectorによる動画グループ検索サービス（OpenAI公式API利用）"""

    def __init__(self, api_key):
        self.api_key = api_key
        self.client = OpenAI(api_key=self.api_key)

    def embed_query(self, query: str):
        # トークン数をチェックして必要に応じて短縮
        token_count = count_tokens(query)
        if token_count > 8000:
            query = truncate_text_to_token_limit(query)
            print(f"Query truncated from {token_count} to {count_tokens(query)} tokens")

        # OpenAI公式APIでクエリをベクトル化
        response = self.client.embeddings.create(
            model="text-embedding-3-small", input=query, encoding_format="float"
        )
        return response.data[0].embedding

    def search_group_chunks(self, group: VideoGroup, query: str, max_results: int = 5):
        # VideoChunkは廃止済みのため未実装
        raise NotImplementedError(
            "VideoChunkは廃止され、Pineconeサーバーレスで管理されています。こちらのメソッドは利用しないでください。"
        )

    def search_group_features(
        self, group: VideoGroup, query: str, max_results: int = 5
    ):
        # VideoFeatureは廃止されたため未実装
        raise NotImplementedError(
            "VideoFeatureは廃止され、字幕・タイムスタンプ検索機能はありません。"
        )

    def search_group_all(self, group: VideoGroup, query: str, max_results: int = 5):
        """チャンク・タイムスタンプ両方まとめて返す"""
        return {
            "group_results": self.search_group_chunks(group, query, max_results),
            "group_timestamp_results": self.search_group_features(
                group, query, max_results
            ),
            "query": query,
            "group_name": group.name,
        }

    def generate_group_rag_answer(self, group, query, max_results=5):
        # 類似チャンクを検索
        context_chunks = self.search_group_chunks(group, query, max_results)
        if not context_chunks:
            return {
                "rag_answer": "申し訳ございませんが、この質問に関連する内容が見つかりませんでした。",
                "timestamp_results": [],
                "query": query,
                "group_name": group.name,
            }

        # コンテキストを作成
        context_text = "\n\n".join(
            [
                f"[{c['video_title']} - {c['start_time']:.1f}s-{c['end_time']:.1f}s] {c['text']}"
                for c in context_chunks
            ]
        )

        # プロンプトを作成
        prompt = f"""あなたは動画グループ「{group.name}」の内容について質問に答えるアシスタントです。

与えられたコンテキスト（動画グループの文字起こし）を基に、質問に対して正確で簡潔な回答を200字以内で提供してください。

コンテキスト:
{context_text}

質問: {query}

回答:"""

        # OpenAI APIで回答生成
        response = self.client.chat.completions.create(
            model="gpt-4o-mini-2024-07-18",
            messages=[
                {
                    "role": "system",
                    "content": "あなたは動画グループの内容に基づいて質問に答えるアシスタントです。",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
            temperature=0.3,
        )
        rag_answer = response.choices[0].message.content.strip()

        # 関連するタイムスタンプも検索
        timestamp_results = self.search_group_features(group, rag_answer, max_results)

        return {
            "rag_answer": rag_answer,
            "timestamp_results": timestamp_results,
            "query": query,
            "group_name": group.name,
        }
