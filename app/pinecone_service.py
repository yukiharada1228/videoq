import os
from typing import List, Dict, Any
from openai import OpenAI
from pinecone import Pinecone, ServerlessSpec
from app.models import VideoGroup
import tiktoken
import re
import json
from pydantic import BaseModel, Field


class RelatedQuestion(BaseModel):
    question: str = Field(..., description="コンテキストに関連する自然な質問")


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


class PineconeSearchService:
    """Pineconeによる動画グループ検索サービス（サーバーレス対応、ユーザーごとインデックス分割）"""

    def __init__(
        self,
        openai_api_key: str | None = None,
        pinecone_api_key: str | None = None,
        user_id: int | None = None,
        ensure_indexes: bool = True,
    ):
        self.openai_api_key = openai_api_key
        # OpenAI APIクライアントの初期化（APIキーがある場合のみ）
        if openai_api_key:
            self.client = OpenAI(api_key=self.openai_api_key)
        else:
            self.client = None

        # Pineconeの初期化
        pinecone_api_key = pinecone_api_key or os.getenv("PINECONE_API_KEY")

        if not pinecone_api_key:
            raise ValueError("Pinecone API key must be provided")

        self.pc = Pinecone(api_key=pinecone_api_key)

        # ユーザーごとにインデックス名を分割
        if user_id is None:
            raise ValueError("user_id must be provided for user-specific index")
        self.user_id = user_id
        self.chunks_index_name = self._normalize_index_name(
            f"videoq_user_{user_id}_chunks"
        )
        self.features_index_name = self._normalize_index_name(
            f"videoq_user_{user_id}_features"
        )

        if ensure_indexes:
            self._ensure_indexes_exist()

    def _normalize_index_name(self, name: str) -> str:
        """
        Pineconeのインデックス名を小文字英数字とハイフンのみ許可に正規化
        """
        MAX_INDEX_NAME_LENGTH = 45
        name = name.lower().replace("_", "-")
        name = re.sub(r"[^a-z0-9-]", "", name)
        name = re.sub(r"-+", "-", name)  # 連続ハイフンを1つに
        name = name.strip("-")  # 先頭・末尾のハイフンを除去
        name = name[:MAX_INDEX_NAME_LENGTH]  # 長さ制限
        return name

    def _ensure_indexes_exist(self):
        """ユーザーごとのサーバーレスインデックスを作成"""
        try:
            # チャンク用サーバーレスインデックス
            if self.chunks_index_name not in self.pc.list_indexes().names():
                print(f"Creating serverless index: {self.chunks_index_name}")
                self.pc.create_index(
                    name=self.chunks_index_name,
                    dimension=1536,
                    metric="cosine",
                    spec=ServerlessSpec(
                        cloud="aws",  # または "gcp", "azure"
                        region="us-east-1",  # 適切なリージョンを選択
                    ),
                )
                print(f"Serverless index {self.chunks_index_name} created successfully")

            # フィーチャー用サーバーレスインデックス
            if self.features_index_name not in self.pc.list_indexes().names():
                print(f"Creating serverless index: {self.features_index_name}")
                self.pc.create_index(
                    name=self.features_index_name,
                    dimension=1536,
                    metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
                )
                print(
                    f"Serverless index {self.features_index_name} created successfully"
                )
        except Exception as e:
            print(f"Error creating serverless indexes: {e}")
            raise

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

    def search_group_chunks(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> List[Dict[str, Any]]:
        """グループ内のチャンクを検索（ユーザーごとインデックス）"""
        query_embedding = self.embed_query(query)
        video_ids = [str(video.id) for video in group.completed_videos]
        index = self.pc.Index(self.chunks_index_name)
        search_results = index.query(
            vector=query_embedding,
            filter={"video_id": {"$in": video_ids}, "type": "chunk"},
            top_k=max_results,
            include_metadata=True,
        )
        results = []
        for match in search_results.matches:
            metadata = match.metadata
            results.append(
                {
                    "text": metadata.get("text", ""),
                    "video_id": metadata.get("video_id", ""),
                    "video_title": metadata.get("video_title", ""),
                    "start_time": metadata.get("start_time", 0.0),
                    "end_time": metadata.get("end_time", 0.0),
                    "chunk_index": metadata.get("chunk_index", 0),
                    "similarity": match.score,
                }
            )
        return results

    def search_group_features(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> list:
        """グループ内のタイムスタンプ付きセグメントをユーザーごとインデックスから検索"""
        query_embedding = self.embed_query(query)
        video_ids = [str(video.id) for video in group.completed_videos]
        index = self.pc.Index(self.features_index_name)
        search_results = index.query(
            vector=query_embedding,
            filter={"video_id": {"$in": video_ids}, "type": "feature"},
            top_k=max_results,
            include_metadata=True,
        )
        results = []
        for match in search_results.matches:
            metadata = match.metadata
            timestamp = metadata.get("timestamp", 0.0)

            # 同じvideo_idとtimestampでchunksインデックスからend_timeを取得
            end_time = timestamp  # デフォルト値
            try:
                chunks_index = self.pc.Index(self.chunks_index_name)
                chunk_results = chunks_index.query(
                    vector=query_embedding,
                    filter={
                        "video_id": metadata.get("video_id", ""),
                        "type": "chunk",
                        "start_time": {"$lte": timestamp},
                        "end_time": {"$gte": timestamp},
                    },
                    top_k=1,
                    include_metadata=True,
                )
                if chunk_results.matches:
                    chunk_metadata = chunk_results.matches[0].metadata
                    end_time = chunk_metadata.get("end_time", timestamp)
            except Exception as e:
                print(f"Warning: Failed to get end_time for timestamp {timestamp}: {e}")

            results.append(
                {
                    "text": metadata.get("text", ""),
                    "video_id": metadata.get("video_id", ""),
                    "video_title": metadata.get("video_title", ""),
                    "timestamp": timestamp,
                    "end_time": end_time,
                    "similarity": match.score,
                }
            )
        return results

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

    class RelatedQuestionsResponse(BaseModel):
        questions: List[RelatedQuestion]

    def generate_related_questions(
        self,
        group: VideoGroup,
        context_chunks: List[Dict[str, Any]],
        max_questions: int = 3,
    ) -> List[Dict[str, str]]:
        """コンテキストに基づいて関連質問を3つ生成（OpenAI function calling/pydantic schema使用）"""
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

        prompt = f"""動画グループ「{group.name}」の以下のコンテキストを読んで、ユーザーが興味を持ちそうな関連質問を3つ必ず生成してください。\n\n【重要】必ずコンテキストの内容に直接関連する質問を優先して生成してください。\nコンテキストに含まれる用語や話題を使って質問を作成してください。\n\n例：コンテキストに「量子化」という単語があれば「量子化とは何ですか？」のような質問を生成してください。\n\nコンテキスト:\n{context_text}\n\n以下の点も考慮してください：\n1. ユーザーが深く理解したいと思いそうな内容\n2. 自然で会話的な質問"""

        # JSON Schema: type: object, properties: questions (array)
        schema = {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": RelatedQuestion.model_json_schema(),
                    "minItems": 3,
                    "maxItems": 3,
                }
            },
            "required": ["questions"],
        }

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini-2024-07-18",
                messages=[
                    {
                        "role": "system",
                        "content": "あなたは動画の内容に基づいて関連質問を生成するアシスタントです。",
                    },
                    {"role": "user", "content": prompt},
                ],
                tools=[
                    {
                        "type": "function",
                        "function": {
                            "name": "generate_related_questions",
                            "description": "動画の内容に基づいて関連質問を3つ生成する",
                            "parameters": schema,
                        },
                    }
                ],
                tool_choice={
                    "type": "function",
                    "function": {"name": "generate_related_questions"},
                },
                max_tokens=500,
                temperature=0.7,
            )

            tool_calls = response.choices[0].message.tool_calls
            if tool_calls and len(tool_calls) > 0:
                arguments = tool_calls[0].function.arguments
                result = self.RelatedQuestionsResponse.parse_raw(arguments)
                return [q.dict() for q in result.questions]
            else:
                return []
        except Exception as e:
            print(f"Error generating related questions: {e}")
            return []

    def generate_group_rag_answer(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> Dict[str, Any]:
        """RAGによる回答生成（サーバーレス対応）"""
        # 類似チャンクを検索
        context_chunks = self.search_group_chunks(group, query, max_results)
        if not context_chunks:
            return {
                "rag_answer": "申し訳ございませんが、この質問に関連する内容が見つかりませんでした。",
                "timestamp_results": [],
                "related_questions": [],
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
        if not self.client:
            raise ValueError("OpenAI API key is required for RAG answer generation")

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

        return {
            "rag_answer": rag_answer,
            "timestamp_results": timestamp_results,
            "related_questions": related_questions,
            "query": query,
            "group_name": group.name,
        }

    def generate_group_rag_answer_stream(
        self, group: VideoGroup, query: str, max_results: int = 5
    ):
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

    def delete_video_data(self, video_id: int):
        """動画に関連するデータをユーザーごとのサーバーレスインデックスから削除
        インデックスが存在しない場合はスキップする
        """
        try:
            chunks_index = self.pc.Index(self.chunks_index_name)
            chunks_index.delete(filter={"video_id": str(video_id), "type": "chunk"})
        except Exception as e:
            if "not found" in str(e).lower() or "does not exist" in str(e).lower():
                print(
                    f"Index {self.chunks_index_name} not found, skip delete for video {video_id}"
                )
            else:
                raise
        try:
            features_index = self.pc.Index(self.features_index_name)
            features_index.delete(filter={"video_id": str(video_id), "type": "feature"})
        except Exception as e:
            if "not found" in str(e).lower() or "does not exist" in str(e).lower():
                print(
                    f"Index {self.features_index_name} not found, skip delete for video {video_id}"
                )
            else:
                raise

    def get_index_info(self):
        """インデックス情報を取得"""
        try:
            chunks_info = self.pc.describe_index(self.chunks_index_name)
            features_info = self.pc.describe_index(self.features_index_name)

            return {
                "chunks_index": {
                    "name": chunks_info.name,
                    "dimension": chunks_info.dimension,
                    "metric": chunks_info.metric,
                    "spec": chunks_info.spec,
                    "status": chunks_info.status,
                },
                "features_index": {
                    "name": features_info.name,
                    "dimension": features_info.dimension,
                    "metric": features_info.metric,
                    "spec": features_info.spec,
                    "status": features_info.status,
                },
            }
        except Exception as e:
            print(f"Error getting index info: {e}")
            return None
