import os
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Generator
from openai import OpenAI
from app.models import VideoGroup
import tiktoken
from pydantic import BaseModel, Field


class RelatedQuestion(BaseModel):
    question: str = Field(..., description="コンテキストに関連する自然な質問")


class RelatedQuestionsResponse(BaseModel):
    questions: List[RelatedQuestion]


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


def truncate_text_to_token_limit(text: str, max_tokens: int = 8000) -> str:
    """
    テキストをトークン制限内に収める
    """
    encoding = tiktoken.encoding_for_model("text-embedding-3-small")
    tokens = encoding.encode(text)

    if len(tokens) <= max_tokens:
        return text

    # トークン制限内に収める
    truncated_tokens = tokens[:max_tokens]
    return encoding.decode(truncated_tokens)


class BaseVectorService(ABC):
    """ベクトル検索サービスのベースクラス"""

    def __init__(
        self,
        user_id: int,
        openai_api_key: str | None = None,
        ensure_indexes: bool = True,
    ):
        if user_id is None:
            raise ValueError("user_id is required for namespace-based indexes")

        self.openai_api_key = openai_api_key
        self.user_id = user_id

        # OpenAI APIクライアントの初期化（APIキーがある場合のみ）
        if openai_api_key:
            self.client = OpenAI(api_key=self.openai_api_key)
        else:
            self.client = None

        # インデックス名（固定名）
        self.chunks_index_name = self._get_chunks_index_name()
        self.features_index_name = self._get_features_index_name()

        if ensure_indexes:
            try:
                self._ensure_indexes_exist()
            except Exception as e:
                print(f"Warning: Could not ensure indexes exist: {e}")

    @abstractmethod
    def _get_chunks_index_name(self) -> str:
        """チャンクインデックス名を取得（固定名）"""
        pass

    @abstractmethod
    def _get_features_index_name(self) -> str:
        """フィーチャーインデックス名を取得（固定名）"""
        pass

    @abstractmethod
    def _ensure_indexes_exist(self):
        """インデックスが存在することを確認"""
        pass

    @abstractmethod
    def search_group_chunks(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> List[Dict[str, Any]]:
        """グループ内のチャンクを検索"""
        pass

    @abstractmethod
    def search_group_features(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> List[Dict[str, Any]]:
        """グループ内のタイムスタンプ付きセグメントを検索"""
        pass

    @abstractmethod
    def delete_video_data(self, video_id: int):
        """特定の動画のデータを削除"""
        pass

    @abstractmethod
    def get_index_info(self) -> Dict[str, Any]:
        """インデックス情報を取得"""
        pass

    def embed_query(self, query: str) -> List[float]:
        """クエリをベクトル化"""
        if not self.client:
            raise ValueError("OpenAI API key is required for embedding queries")

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

    def search_group_all(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> Dict[str, Any]:
        """チャンク・タイムスタンプ両方まとめて返す"""
        return {
            "group_results": self.search_group_chunks(group, query, max_results),
            "group_timestamp_results": self.search_group_features(
                group, query, max_results
            ),
            "query": query,
            "group_name": group.name,
        }

    def generate_related_questions(
        self,
        group: VideoGroup,
        context_chunks: List[Dict[str, Any]],
        max_questions: int = 3,
    ) -> List[Dict[str, str]]:
        """コンテキストに基づいて関連質問を3つ生成"""
        if not self.client:
            raise ValueError("OpenAI API key is required for question generation")

        if not context_chunks:
            return []

        context_text = "\n\n".join(
            [
                f"[{c['video_title']} - {c['start_time']:.1f}s-{c['end_time']:.1f}s] {c['text']}"
                for c in context_chunks
            ]
        )

        prompt = f"""動画グループ「{group.name}」の以下のコンテキストを読んで、ユーザーが興味を持ちそうな関連質問を3つ必ず生成してください。\n\n【重要】必ずコンテキストの内容に直接関連する質問を優先して生成してください。\nコンテキストに含まれる用語や話題を使って質問を作成してください。\n\nコンテキスト:\n{context_text}\n\n以下の点も考慮してください：\n1. ユーザーが深く理解したいと思いそうな内容\n2. 自然で会話的な質問"""

        try:
            response = self.client.responses.parse(
                model="gpt-4o-mini-2024-07-18",
                input=[
                    {
                        "role": "system",
                        "content": "あなたは動画の内容に基づいて関連質問を生成するアシスタントです。",
                    },
                    {"role": "user", "content": prompt},
                ],
                text_format=RelatedQuestionsResponse,
            )
            parsed_result = response.output_parsed
            questions = [q.model_dump() for q in parsed_result.questions]
            return questions
        except Exception as e:
            print(f"Error generating related questions: {e}")
            return []

    def generate_group_rag_answer(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> Dict[str, Any]:
        """グループ内の動画を使ってRAG回答を生成"""
        if not self.client:
            raise ValueError("OpenAI API key is required for RAG answer generation")

        # 検索結果を取得
        search_results = self.search_group_all(group, query, max_results)

        # コンテキストを構築
        context_parts = []

        # チャンク結果を追加
        for result in search_results["group_results"]:
            context_parts.append(
                f"動画: {result['video_title']} (時間: {result['start_time']:.1f}s-{result['end_time']:.1f}s)\n内容: {result['text']}"
            )

        # タイムスタンプ結果を追加
        for result in search_results["group_timestamp_results"]:
            context_parts.append(
                f"動画: {result['video_title']} (時間: {result['timestamp']:.1f}s)\n内容: {result['text']}"
            )

        context = "\n\n".join(context_parts)

        # RAG回答生成のプロンプト
        prompt = f"""あなたは動画グループ「{group.name}」の内容について質問に答えるアシスタントです。

与えられたコンテキスト（動画グループの文字起こし）を基に、質問に対して正確で簡潔な回答を200字以内で提供してください。

コンテキスト:
{context}

質問: {query}

回答:"""

        try:
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

            answer = response.choices[0].message.content

            return {
                "answer": answer,
                "context": context,
                "search_results": search_results,
                "query": query,
                "group_name": group.name,
            }

        except Exception as e:
            print(f"Error generating RAG answer: {e}")
            return {
                "answer": "申し訳ございませんが、回答の生成中にエラーが発生しました。",
                "context": context,
                "search_results": search_results,
                "query": query,
                "group_name": group.name,
                "error": str(e),
            }

    def generate_group_rag_answer_stream(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> Generator[Dict[str, Any], None, None]:
        """RAGによる回答生成（ストリーミング対応）"""
        # 類似チャンクを検索
        context_chunks = self.search_group_chunks(group, query, max_results)
        if not context_chunks:
            yield {
                "type": "error",
                "message": "申し訳ございませんが、この質問に関連する内容が見つかりませんでした。",
            }
            return

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

        # OpenAI APIでストリーミング回答生成
        if not self.client:
            yield {
                "type": "error",
                "message": "OpenAI API key is required for RAG answer generation",
            }
            return

        try:
            stream = self.client.chat.completions.create(
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
                stream=True,
            )

            full_answer = ""
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    full_answer += content
                    yield {
                        "type": "content",
                        "content": content,
                        "full_answer": full_answer,
                    }

            # 完全な回答が生成されたら、関連するタイムスタンプも検索
            timestamp_results = self.search_group_features(
                group, full_answer, max_results
            )

            # 関連質問を生成（timestamp検索結果を優先）
            if timestamp_results:
                # timestamp検索でヒットしたチャンクを関連質問生成に使用
                timestamp_context_chunks = []
                for result in timestamp_results:
                    timestamp_context_chunks.append(
                        {
                            "text": result["text"],
                            "video_id": result["video_id"],
                            "video_title": result["video_title"],
                            "start_time": result["timestamp"],
                            "end_time": result["end_time"],  # 本当のend_timeを使用
                        }
                    )
                related_questions = self.generate_related_questions(
                    group, timestamp_context_chunks, max_questions=3
                )
            else:
                # timestamp検索結果がない場合は従来通りRAGコンテキストを使用
                related_questions = self.generate_related_questions(
                    group, context_chunks, max_questions=3
                )

            yield {
                "type": "complete",
                "full_answer": full_answer,
                "timestamp_results": timestamp_results,
                "related_questions": related_questions,
                "query": query,
                "group_name": group.name,
            }

        except Exception as e:
            yield {
                "type": "error",
                "message": f"回答生成中にエラーが発生しました: {str(e)}",
            }
