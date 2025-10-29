"""
PGVector操作の統一管理（DRY原則・N+1問題対策）
"""

import logging
import os
import psycopg2
from pgvector.psycopg2 import register_vector

logger = logging.getLogger(__name__)


class PGVectorManager:
    """
    PGVector操作の統一管理クラス（DRY原則・N+1問題対策）
    """
    
    _config = None
    _connection = None
    
    @classmethod
    def get_config(cls):
        """
        PGVector設定を取得（DRY原則・シングルトンパターン）
        """
        if cls._config is None:
            cls._config = {
                "database_url": os.getenv(
                    "DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/postgres"
                ),
                "collection_name": os.getenv("PGVECTOR_COLLECTION_NAME", "ask_video_scenes"),
            }
        return cls._config
    
    @classmethod
    def get_connection(cls):
        """
        PGVector接続を取得（DRY原則・接続プール）
        """
        if cls._connection is None or cls._connection.closed:
            config = cls.get_config()
            cls._connection = psycopg2.connect(config["database_url"])
            register_vector(cls._connection)
        return cls._connection
    
    @classmethod
    def close_connection(cls):
        """
        接続を閉じる（DRY原則）
        """
        if cls._connection and not cls._connection.closed:
            cls._connection.close()
            cls._connection = None
    
    @classmethod
    def execute_with_connection(cls, operation_func):
        """
        接続を使用して操作を実行（DRY原則・N+1問題対策）
        """
        conn = cls.get_connection()
        cursor = conn.cursor()
        
        try:
            result = operation_func(cursor)
            conn.commit()
            return result
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()


def delete_video_vectors(video_id):
    """
    指定された動画IDに関連するベクトルデータをPGVectorから確実に削除（DRY原則・N+1問題対策）
    """
    try:
        config = PGVectorManager.get_config()
        logger.info(f"Deleting vectors for video ID: {video_id} from collection: {config['collection_name']}")

        def delete_operation(cursor):
            # video_idでフィルタリングして一発で削除
            delete_query = """
                DELETE FROM langchain_pg_embedding 
                WHERE cmetadata->>'video_id' = %s
            """
            cursor.execute(delete_query, (str(video_id),))
            return cursor.rowcount

        deleted_count = PGVectorManager.execute_with_connection(delete_operation)
        
        if deleted_count > 0:
            logger.info(f"Successfully deleted {deleted_count} vector documents for video ID: {video_id}")
        else:
            logger.info(f"No vector documents found for video ID: {video_id}")

    except Exception as e:
        logger.warning(f"Failed to delete vectors for video ID {video_id}: {e}", exc_info=True)


def delete_video_vectors_batch(video_ids):
    """
    複数の動画IDに関連するベクトルデータをバッチで削除（N+1問題対策）
    """
    if not video_ids:
        return
    
    try:
        config = PGVectorManager.get_config()
        logger.info(f"Batch deleting vectors for {len(video_ids)} videos from collection: {config['collection_name']}")

        def batch_delete_operation(cursor):
            # 複数のvideo_idを一度に削除（N+1問題対策）
            video_id_strs = [str(vid) for vid in video_ids]
            placeholders = ','.join(['%s'] * len(video_id_strs))
            
            delete_query = f"""
                DELETE FROM langchain_pg_embedding 
                WHERE cmetadata->>'video_id' = ANY(ARRAY[{placeholders}])
            """
            cursor.execute(delete_query, video_id_strs)
            return cursor.rowcount

        deleted_count = PGVectorManager.execute_with_connection(batch_delete_operation)
        
        if deleted_count > 0:
            logger.info(f"Successfully batch deleted {deleted_count} vector documents for {len(video_ids)} videos")
        else:
            logger.info(f"No vector documents found for the batch of {len(video_ids)} videos")

    except Exception as e:
        logger.warning(f"Failed to batch delete vectors for videos {video_ids}: {e}", exc_info=True)


