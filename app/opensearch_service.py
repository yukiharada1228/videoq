import os
from typing import List, Dict, Any
from openai import OpenAI
from opensearchpy import OpenSearch, helpers
from app.models import VideoGroup
import tiktoken
import re
import json
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


class OpenSearchService:
    """OpenSearchによる動画グループ検索サービス（ユーザーごとインデックス分割）"""

    class RelatedQuestionsResponse(BaseModel):
        questions: List[RelatedQuestion]

    def __init__(
        self,
        openai_api_key: str | None = None,
        opensearch_host: str | None = None,
        opensearch_port: int = 9200,
        user_id: int | None = None,
        ensure_indexes: bool = True,
    ):
        self.openai_api_key = openai_api_key
        # OpenAI APIクライアントの初期化（APIキーがある場合のみ）
        if openai_api_key:
            self.client = OpenAI(api_key=self.openai_api_key)
        else:
            self.client = None

        # OpenSearchクライアントの初期化
        self.opensearch_host = opensearch_host or os.getenv('OPENSEARCH_HOST', 'opensearch')
        self.opensearch_port = opensearch_port
        
        # OpenSearch接続
        try:
            self.opensearch = OpenSearch(
                hosts=[{'host': self.opensearch_host, 'port': self.opensearch_port}],
                use_ssl=False,
                verify_certs=False,
                timeout=30,
                max_retries=3,
                retry_on_timeout=True,
            )
            self.opensearch.info()
            print(f"Successfully connected to OpenSearch at {self.opensearch_host}:{self.opensearch_port}")
        except Exception as e:
            print(f"Error creating indexes: {e}")
            self.opensearch = None

        # ユーザーごとにインデックス名を分割
        if user_id is None:
            raise ValueError("user_id must be provided for user-specific index")
        self.user_id = user_id
        self.chunks_index_name = f"videoq_user_{user_id}_chunks"
        self.features_index_name = f"videoq_user_{user_id}_features"

        if ensure_indexes:
            try:
                self._ensure_indexes_exist()
            except Exception as e:
                print(f"Warning: Could not ensure indexes exist: {e}")
                # インデックス作成に失敗しても続行

    def _ensure_indexes_exist(self):
        """ユーザーごとのインデックスを作成"""
        if self.opensearch is None:
            print("OpenSearch connection not available")
            return
            
        try:
            # 接続テスト
            self.opensearch.info()
            
            # チャンク用インデックス
            if not self.opensearch.indices.exists(index=self.chunks_index_name):
                print(f"Creating index: {self.chunks_index_name}")
                index_body = {
                    "settings": {
                        "index": {
                            "knn": True,
                            "knn.algo_param.ef_search": 100,
                            "number_of_replicas": 0
                        }
                    },
                    "mappings": {
                        "properties": {
                            "vector": {
                                "type": "knn_vector",
                                "dimension": 1536,
                                "method": {
                                    "name": "hnsw",
                                    "space_type": "cosinesimil",
                                    "engine": "nmslib",
                                    "parameters": {
                                        "ef_construction": 128,
                                        "m": 16
                                    }
                                }
                            },
                            "text": {"type": "text"},
                            "video_id": {"type": "keyword"},
                            "video_title": {"type": "text"},
                            "start_time": {"type": "float"},
                            "end_time": {"type": "float"},
                            "chunk_index": {"type": "integer"},
                            "type": {"type": "keyword"},
                            "user_id": {"type": "keyword"}
                        }
                    }
                }
                self.opensearch.indices.create(index=self.chunks_index_name, body=index_body)
                print(f"Index {self.chunks_index_name} created successfully")

            # フィーチャー用インデックス
            if not self.opensearch.indices.exists(index=self.features_index_name):
                print(f"Creating index: {self.features_index_name}")
                index_body = {
                    "settings": {
                        "index": {
                            "knn": True,
                            "knn.algo_param.ef_search": 100,
                            "number_of_replicas": 0
                        }
                    },
                    "mappings": {
                        "properties": {
                            "vector": {
                                "type": "knn_vector",
                                "dimension": 1536,
                                "method": {
                                    "name": "hnsw",
                                    "space_type": "cosinesimil",
                                    "engine": "nmslib",
                                    "parameters": {
                                        "ef_construction": 128,
                                        "m": 16
                                    }
                                }
                            },
                            "text": {"type": "text"},
                            "video_id": {"type": "keyword"},
                            "video_title": {"type": "text"},
                            "timestamp": {"type": "float"},
                            "type": {"type": "keyword"},
                            "user_id": {"type": "keyword"}
                        }
                    }
                }
                self.opensearch.indices.create(index=self.features_index_name, body=index_body)
                print(f"Index {self.features_index_name} created successfully")

        except Exception as e:
            print(f"Error creating indexes: {e}")
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
        if self.opensearch is None:
            print("OpenSearch connection not available")
            return []
            
        try:
            # 接続テスト
            self.opensearch.info()
        except Exception as e:
            print(f"OpenSearch connection error: {e}")
            return []
            
        query_embedding = self.embed_query(query)
        video_ids = [str(video.id) for video in group.completed_videos]
        
        search_body = {
            "size": max_results,
            "query": {
                "bool": {
                    "must": [
                        {
                            "knn": {
                                "vector": {
                                    "vector": query_embedding,
                                    "k": max_results
                                }
                            }
                        }
                    ],
                    "filter": [
                        {"terms": {"video_id": video_ids}},
                        {"term": {"type": "chunk"}},
                        {"term": {"user_id": str(self.user_id)}}
                    ]
                }
            }
        }
        
        response = self.opensearch.search(index=self.chunks_index_name, body=search_body)
        results = []
        
        for hit in response['hits']['hits']:
            source = hit['_source']
            results.append({
                "text": source.get("text", ""),
                "video_id": source.get("video_id", ""),
                "video_title": source.get("video_title", ""),
                "start_time": source.get("start_time", 0.0),
                "end_time": source.get("end_time", 0.0),
                "chunk_index": source.get("chunk_index", 0),
                "similarity": hit['_score'],
            })
        
        return results

    def search_group_features(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> list:
        """グループ内のタイムスタンプ付きセグメントをユーザーごとインデックスから検索"""
        if self.opensearch is None:
            print("OpenSearch connection not available")
            return []
            
        try:
            # 接続テスト
            self.opensearch.info()
        except Exception as e:
            print(f"OpenSearch connection error: {e}")
            return []
            
        query_embedding = self.embed_query(query)
        video_ids = [str(video.id) for video in group.completed_videos]
        
        search_body = {
            "size": max_results,
            "query": {
                "bool": {
                    "must": [
                        {
                            "knn": {
                                "vector": {
                                    "vector": query_embedding,
                                    "k": max_results
                                }
                            }
                        }
                    ],
                    "filter": [
                        {"terms": {"video_id": video_ids}},
                        {"term": {"type": "feature"}},
                        {"term": {"user_id": str(self.user_id)}}
                    ]
                }
            }
        }
        
        response = self.opensearch.search(index=self.features_index_name, body=search_body)
        results = []
        
        for hit in response['hits']['hits']:
            source = hit['_source']
            timestamp = source.get("timestamp", 0.0)

            # 同じvideo_idとtimestampでchunksインデックスからend_timeを取得
            end_time = timestamp  # デフォルト値
            try:
                chunk_search_body = {
                    "size": 1,
                    "query": {
                        "bool": {
                            "filter": [
                                {"term": {"video_id": source.get("video_id", "")}},
                                {"term": {"type": "chunk"}},
                                {"range": {"start_time": {"lte": timestamp}}},
                                {"range": {"end_time": {"gte": timestamp}}}
                            ]
                        }
                    }
                }
                chunk_response = self.opensearch.search(index=self.chunks_index_name, body=chunk_search_body)
                if chunk_response['hits']['hits']:
                    chunk_source = chunk_response['hits']['hits'][0]['_source']
                    end_time = chunk_source.get("end_time", timestamp)
            except Exception as e:
                print(f"Warning: Failed to get end_time for timestamp {timestamp}: {e}")

            results.append({
                "text": source.get("text", ""),
                "video_id": source.get("video_id", ""),
                "video_title": source.get("video_title", ""),
                "timestamp": timestamp,
                "end_time": end_time,
                "similarity": hit['_score'],
            })
        
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
        """グループ内の動画を使ってRAG回答を生成"""
        if not self.client:
            raise ValueError("OpenAI API key is required for RAG answer generation")

        # 検索結果を取得
        search_results = self.search_group_all(group, query, max_results)
        
        # コンテキストを構築
        context_parts = []
        
        # チャンク結果を追加
        for result in search_results["group_results"]:
            context_parts.append(f"動画: {result['video_title']} (時間: {result['start_time']:.1f}s-{result['end_time']:.1f}s)\n内容: {result['text']}")
        
        # タイムスタンプ結果を追加
        for result in search_results["group_timestamp_results"]:
            context_parts.append(f"動画: {result['video_title']} (時間: {result['timestamp']:.1f}s)\n内容: {result['text']}")
        
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
                "error": str(e)
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
        """特定の動画のデータを削除"""
        try:
            # チャンクインデックスから削除
            delete_query = {
                "query": {
                    "bool": {
                        "filter": [
                            {"term": {"video_id": str(video_id)}},
                            {"term": {"user_id": str(self.user_id)}}
                        ]
                    }
                }
            }
            
            self.opensearch.delete_by_query(index=self.chunks_index_name, body=delete_query)
            self.opensearch.delete_by_query(index=self.features_index_name, body=delete_query)
            
            print(f"Deleted data for video_id: {video_id}")
            
        except Exception as e:
            print(f"Error deleting video data: {e}")
            raise

    def get_index_info(self):
        """インデックス情報を取得"""
        try:
            chunks_info = self.opensearch.indices.get(index=self.chunks_index_name)
            features_info = self.opensearch.indices.get(index=self.features_index_name)
            
            return {
                "chunks_index": {
                    "name": self.chunks_index_name,
                    "doc_count": chunks_info[self.chunks_index_name]['total']['docs']['count'],
                    "size": chunks_info[self.chunks_index_name]['total']['store']['size_in_bytes']
                },
                "features_index": {
                    "name": self.features_index_name,
                    "doc_count": features_info[self.features_index_name]['total']['docs']['count'],
                    "size": features_info[self.features_index_name]['total']['store']['size_in_bytes']
                }
            }
        except Exception as e:
            print(f"Error getting index info: {e}")
            return {"error": str(e)} 