import os
from typing import List, Dict, Any
from pinecone import Pinecone, ServerlessSpec
from app.models import VideoGroup
from app.base_vector_service import BaseVectorService


class PineconeService(BaseVectorService):
    """Pineconeサーバレスによる動画グループ検索サービス（ユーザーごとインデックス分割）"""

    def __init__(
        self,
        user_id: int,
        openai_api_key: str | None = None,
        pinecone_api_key: str | None = None,
        pinecone_cloud: str | None = None,
        pinecone_region: str | None = None,
        ensure_indexes: bool = True,
    ):
        # Pineconeサーバレスクライアントの初期化
        self.pinecone_api_key = pinecone_api_key or os.getenv("PINECONE_API_KEY")
        self.pinecone_cloud = pinecone_cloud or os.getenv("PINECONE_CLOUD", "aws")
        self.pinecone_region = pinecone_region or os.getenv(
            "PINECONE_REGION", "us-east-1"
        )

        if not self.pinecone_api_key:
            raise ValueError("Pinecone API key is required for serverless")
        if not self.pinecone_cloud:
            raise ValueError("Pinecone cloud is required for serverless")
        if not self.pinecone_region:
            raise ValueError("Pinecone region is required for serverless")

        # Pineconeサーバレス接続
        try:
            self.pinecone = Pinecone(api_key=self.pinecone_api_key)
            print(
                f"Successfully connected to Pinecone serverless in {self.pinecone_cloud} cloud, {self.pinecone_region} region"
            )
        except Exception as e:
            print(f"Error connecting to Pinecone serverless: {e}")
            raise

        # ベースクラスの初期化
        super().__init__(
            user_id=user_id,
            openai_api_key=openai_api_key,
            ensure_indexes=ensure_indexes,
        )

    def _get_chunks_index_name(self) -> str:
        """チャンクインデックス名を取得（ユーザー固有）"""
        return f"videoq-chunks-{self.user_id}"

    def _get_features_index_name(self) -> str:
        """フィーチャーインデックス名を取得（ユーザー固有）"""
        return f"videoq-features-{self.user_id}"

    def _ensure_indexes_exist(self):
        """Pineconeサーバレスインデックスを作成"""
        try:
            # チャンク用サーバレスインデックス
            if self.chunks_index_name not in self.pinecone.list_indexes():
                print(f"Creating serverless index: {self.chunks_index_name}")
                self.pinecone.create_index(
                    name=self.chunks_index_name,
                    dimension=1536,
                    metric="cosine",
                    spec=ServerlessSpec(
                        cloud=self.pinecone_cloud, region=self.pinecone_region
                    ),
                )
                print(f"Serverless index {self.chunks_index_name} created successfully")
            else:
                print(f"Serverless index {self.chunks_index_name} already exists")

            # フィーチャー用サーバレスインデックス
            if self.features_index_name not in self.pinecone.list_indexes():
                print(f"Creating serverless index: {self.features_index_name}")
                self.pinecone.create_index(
                    name=self.features_index_name,
                    dimension=1536,
                    metric="cosine",
                    spec=ServerlessSpec(
                        cloud=self.pinecone_cloud, region=self.pinecone_region
                    ),
                )
                print(
                    f"Serverless index {self.features_index_name} created successfully"
                )
            else:
                print(f"Serverless index {self.features_index_name} already exists")
        except Exception as e:
            print(f"Error creating serverless indexes: {e}")
            raise

    def search_group_chunks(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> List[Dict[str, Any]]:
        """グループ内のチャンクをサーバレスインデックスから検索"""
        try:
            index = self.pinecone.Index(self.chunks_index_name)
        except Exception as e:
            print(f"Pinecone serverless index error: {e}")
            return []

        query_embedding = self.embed_query(query)
        video_ids = [str(video.id) for video in group.completed_videos]

        # Pinecone検索クエリ（ユーザー固有インデックスのためuser_idフィルター不要）
        search_response = index.query(
            vector=query_embedding,
            top_k=max_results * 2,  # フィルタリング後に十分な結果を得るため
            include_metadata=True,
            filter={
                "video_id": {"$in": video_ids},
                "type": "chunk",
            },
        )

        results = []
        for match in search_response.matches[:max_results]:
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
        """グループ内のタイムスタンプ付きセグメントをサーバレスインデックスから検索"""
        try:
            index = self.pinecone.Index(self.features_index_name)
        except Exception as e:
            print(f"Pinecone serverless index error: {e}")
            return []

        query_embedding = self.embed_query(query)
        video_ids = [str(video.id) for video in group.completed_videos]

        # Pinecone検索クエリ（ユーザー固有インデックスのためuser_idフィルター不要）
        search_response = index.query(
            vector=query_embedding,
            top_k=max_results * 2,  # フィルタリング後に十分な結果を得るため
            include_metadata=True,
            filter={
                "video_id": {"$in": video_ids},
                "type": "feature",
            },
        )

        results = []
        for match in search_response.matches[:max_results]:
            metadata = match.metadata
            timestamp = metadata.get("timestamp", 0.0)

            # 同じvideo_idとtimestampでchunksインデックスからend_timeを取得
            end_time = timestamp  # デフォルト値
            try:
                chunks_index = self.pinecone.Index(self.chunks_index_name)
                chunk_search_response = chunks_index.query(
                    vector=query_embedding,
                    top_k=1,
                    include_metadata=True,
                    filter={
                        "video_id": metadata.get("video_id", ""),
                        "type": "chunk",
                        "start_time": {"$lte": timestamp},
                        "end_time": {"$gte": timestamp},
                    },
                )
                if chunk_search_response.matches:
                    chunk_metadata = chunk_search_response.matches[0].metadata
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

    def delete_video_data(self, video_id: int):
        """特定の動画のデータを削除"""
        try:
            # チャンクインデックスから削除（ユーザー固有インデックスのためuser_idフィルター不要）
            chunks_index = self.pinecone.Index(self.chunks_index_name)
            chunks_index.delete(filter={"video_id": str(video_id)})

            # フィーチャーインデックスから削除（ユーザー固有インデックスのためuser_idフィルター不要）
            features_index = self.pinecone.Index(self.features_index_name)
            features_index.delete(filter={"video_id": str(video_id)})

            print(f"Deleted data for video_id: {video_id}")

        except Exception as e:
            print(f"Error deleting video data: {e}")
            raise

    def get_index_info(self):
        """インデックス情報を取得"""
        try:
            chunks_index = self.pinecone.Index(self.chunks_index_name)
            features_index = self.pinecone.Index(self.features_index_name)

            chunks_stats = chunks_index.describe_index_stats()
            features_stats = features_index.describe_index_stats()

            return {
                "chunks_index": {
                    "name": self.chunks_index_name,
                    "doc_count": chunks_stats.total_vector_count,
                    "dimension": chunks_stats.dimension,
                },
                "features_index": {
                    "name": self.features_index_name,
                    "doc_count": features_stats.total_vector_count,
                    "dimension": features_stats.dimension,
                },
            }
        except Exception as e:
            print(f"Error getting index info: {e}")
            return {"error": str(e)}

    def upsert_chunks(self, chunks_data: List[Dict[str, Any]]):
        """チャンクデータをPineconeサーバレスインデックスに挿入"""
        try:
            index = self.pinecone.Index(self.chunks_index_name)

            vectors = []
            for chunk in chunks_data:
                vector_id = (
                    f"chunk_{chunk['video_id']}_{chunk['chunk_index']}_{self.user_id}"
                )
                vectors.append(
                    {
                        "id": vector_id,
                        "values": chunk["vector"],
                        "metadata": {
                            "text": chunk["text"],
                            "video_id": str(chunk["video_id"]),
                            "video_title": chunk["video_title"],
                            "start_time": chunk["start_time"],
                            "end_time": chunk["end_time"],
                            "chunk_index": chunk["chunk_index"],
                            "type": "chunk",
                        },
                    }
                )

            # サーバレスインデックスにバッチで挿入
            index.upsert(vectors=vectors)
            print(f"Upserted {len(vectors)} chunks to Pinecone serverless index")

        except Exception as e:
            print(f"Error upserting chunks to serverless index: {e}")
            raise

    def upsert_features(self, features_data: List[Dict[str, Any]]):
        """フィーチャーデータをPineconeサーバレスインデックスに挿入"""
        try:
            index = self.pinecone.Index(self.features_index_name)

            vectors = []
            for feature in features_data:
                vector_id = f"feature_{feature['video_id']}_{feature['timestamp']}_{self.user_id}"
                vectors.append(
                    {
                        "id": vector_id,
                        "values": feature["vector"],
                        "metadata": {
                            "text": feature["text"],
                            "video_id": str(feature["video_id"]),
                            "video_title": feature["video_title"],
                            "timestamp": feature["timestamp"],
                            "type": "feature",
                        },
                    }
                )

            # サーバレスインデックスにバッチで挿入
            index.upsert(vectors=vectors)
            print(f"Upserted {len(vectors)} features to Pinecone serverless index")

        except Exception as e:
            print(f"Error upserting features to serverless index: {e}")
            raise
