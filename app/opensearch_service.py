import os
from typing import List, Dict, Any
from opensearchpy import OpenSearch
from app.models import VideoGroup
from app.base_vector_service import BaseVectorService


class OpenSearchService(BaseVectorService):
    """OpenSearchによる動画グループ検索サービス（ユーザーごとインデックス分割）"""

    def __init__(
        self,
        openai_api_key: str | None = None,
        opensearch_host: str | None = None,
        opensearch_port: int = 9200,
        user_id: int | None = None,
        ensure_indexes: bool = True,
    ):
        # OpenSearchクライアントの初期化
        self.opensearch_host = opensearch_host or os.getenv(
            "OPENSEARCH_HOST", "opensearch"
        )
        self.opensearch_port = opensearch_port

        # OpenSearch接続
        try:
            self.opensearch = OpenSearch(
                hosts=[{"host": self.opensearch_host, "port": self.opensearch_port}],
                use_ssl=False,
                verify_certs=False,
                timeout=30,
                max_retries=3,
                retry_on_timeout=True,
            )
            self.opensearch.info()
            print(
                f"Successfully connected to OpenSearch at {self.opensearch_host}:{self.opensearch_port}"
            )
        except Exception as e:
            print(f"Error creating indexes: {e}")
            self.opensearch = None

        # ベースクラスの初期化
        super().__init__(
            openai_api_key=openai_api_key,
            user_id=user_id,
            ensure_indexes=ensure_indexes,
        )

    def _get_chunks_index_name(self) -> str:
        """チャンクインデックス名を取得"""
        return "videoq_chunks"

    def _get_features_index_name(self) -> str:
        """フィーチャーインデックス名を取得"""
        return "videoq_features"

    def _ensure_indexes_exist(self):
        """単一インデックスを作成"""
        if self._indexes_checked:
            return
        if self.opensearch is None:
            print("OpenSearch connection not available")
            return
        try:
            self.opensearch.info()
            # チャンク用インデックス
            if not self.opensearch.indices.exists(index=self.chunks_index_name):
                print(f"Creating index: {self.chunks_index_name}")
                index_body = {
                    "settings": {
                        "index": {
                            "knn": True,
                            "knn.algo_param.ef_search": 100,
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
                                    "engine": "faiss",
                                    "parameters": {"ef_construction": 128, "m": 16},
                                },
                            },
                            "text": {"type": "text"},
                            "video_id": {"type": "keyword"},
                            "video_title": {"type": "text"},
                            "start_time": {"type": "float"},
                            "end_time": {"type": "float"},
                            "chunk_index": {"type": "integer"},
                            "type": {"type": "keyword"},
                            "user_id": {"type": "keyword"},
                        }
                    },
                }
                self.opensearch.indices.create(
                    index=self.chunks_index_name, body=index_body
                )
                print(f"Index {self.chunks_index_name} created successfully")
            # フィーチャー用インデックス
            if not self.opensearch.indices.exists(index=self.features_index_name):
                print(f"Creating index: {self.features_index_name}")
                index_body = {
                    "settings": {
                        "index": {
                            "knn": True,
                            "knn.algo_param.ef_search": 100,
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
                                    "engine": "faiss",
                                    "parameters": {"ef_construction": 128, "m": 16},
                                },
                            },
                            "text": {"type": "text"},
                            "video_id": {"type": "keyword"},
                            "video_title": {"type": "text"},
                            "timestamp": {"type": "float"},
                            "type": {"type": "keyword"},
                            "user_id": {"type": "keyword"},
                        }
                    },
                }
                self.opensearch.indices.create(
                    index=self.features_index_name, body=index_body
                )
                print(f"Index {self.features_index_name} created successfully")
            self._indexes_checked = True
        except Exception as e:
            print(f"Error creating indexes: {e}")
            raise

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
                                "vector": {"vector": query_embedding, "k": max_results}
                            }
                        }
                    ],
                    "filter": [
                        {"terms": {"video_id": video_ids}},
                        {"term": {"type": "chunk"}},
                        {"term": {"user_id": str(self.user_id)}},
                    ],
                }
            },
        }

        response = self.opensearch.search(
            index=self.chunks_index_name, body=search_body
        )
        results = []

        for hit in response["hits"]["hits"]:
            source = hit["_source"]
            results.append(
                {
                    "text": source.get("text", ""),
                    "video_id": source.get("video_id", ""),
                    "video_title": source.get("video_title", ""),
                    "start_time": source.get("start_time", 0.0),
                    "end_time": source.get("end_time", 0.0),
                    "chunk_index": source.get("chunk_index", 0),
                    "similarity": hit["_score"],
                }
            )

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
                                "vector": {"vector": query_embedding, "k": max_results}
                            }
                        }
                    ],
                    "filter": [
                        {"terms": {"video_id": video_ids}},
                        {"term": {"type": "feature"}},
                        {"term": {"user_id": str(self.user_id)}},
                    ],
                }
            },
        }

        response = self.opensearch.search(
            index=self.features_index_name, body=search_body
        )
        results = []

        for hit in response["hits"]["hits"]:
            source = hit["_source"]
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
                                {"range": {"end_time": {"gte": timestamp}}},
                            ]
                        }
                    },
                }
                chunk_response = self.opensearch.search(
                    index=self.chunks_index_name, body=chunk_search_body
                )
                if chunk_response["hits"]["hits"]:
                    chunk_source = chunk_response["hits"]["hits"][0]["_source"]
                    end_time = chunk_source.get("end_time", timestamp)
            except Exception as e:
                print(f"Warning: Failed to get end_time for timestamp {timestamp}: {e}")

            results.append(
                {
                    "text": source.get("text", ""),
                    "video_id": source.get("video_id", ""),
                    "video_title": source.get("video_title", ""),
                    "timestamp": timestamp,
                    "end_time": end_time,
                    "similarity": hit["_score"],
                }
            )

        return results

    def delete_video_data(self, video_id: int):
        """特定の動画のデータを削除"""
        try:
            # チャンクインデックスから削除
            delete_query = {
                "query": {
                    "bool": {
                        "filter": [
                            {"term": {"video_id": str(video_id)}},
                            {"term": {"user_id": str(self.user_id)}},
                        ]
                    }
                }
            }

            self.opensearch.delete_by_query(
                index=self.chunks_index_name, body=delete_query
            )
            self.opensearch.delete_by_query(
                index=self.features_index_name, body=delete_query
            )

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
                    "doc_count": chunks_info[self.chunks_index_name]["total"]["docs"][
                        "count"
                    ],
                    "size": chunks_info[self.chunks_index_name]["total"]["store"][
                        "size_in_bytes"
                    ],
                },
                "features_index": {
                    "name": self.features_index_name,
                    "doc_count": features_info[self.features_index_name]["total"][
                        "docs"
                    ]["count"],
                    "size": features_info[self.features_index_name]["total"]["store"][
                        "size_in_bytes"
                    ],
                },
            }
        except Exception as e:
            print(f"Error getting index info: {e}")
            return {"error": str(e)}
