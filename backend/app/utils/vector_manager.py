"""
Unified management of PGVector operations
"""

import logging
import os

import psycopg2
from pgvector.psycopg2 import register_vector

logger = logging.getLogger(__name__)


class PGVectorManager:
    """
    Unified management class for PGVector operations
    """

    _config = None
    _connection = None

    @classmethod
    def get_config(cls):
        """
        Get PGVector configuration (singleton pattern)
        """
        if cls._config is None:
            cls._config = {
                "database_url": os.getenv(
                    "DATABASE_URL",
                    "postgresql://postgres:postgres@postgres:5432/postgres",
                ),
                "collection_name": os.getenv(
                    "PGVECTOR_COLLECTION_NAME", "videoq_scenes"
                ),
            }
        return cls._config

    @classmethod
    def get_connection(cls):
        """
        Get PGVector connection (connection pool)
        """
        if cls._connection is None or cls._connection.closed:
            config = cls.get_config()
            cls._connection = psycopg2.connect(config["database_url"])
            register_vector(cls._connection)
        return cls._connection

    @classmethod
    def close_connection(cls):
        """
        Close connection
        """
        if cls._connection and not cls._connection.closed:
            cls._connection.close()
            cls._connection = None

    @classmethod
    def execute_with_connection(cls, operation_func):
        """
        Execute operation using connection
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

    @classmethod
    def get_psycopg_connection_string(cls):
        """
        Get connection string for langchain_postgres
        Convert postgresql:// → postgresql+psycopg://
        """
        connection_str = cls.get_config()["database_url"]
        if connection_str.startswith("postgresql://"):
            connection_str = connection_str.replace(
                "postgresql://", "postgresql+psycopg://", 1
            )
        return connection_str


def delete_video_vectors(video_id):
    """
    Safely delete vector data related to the specified video ID from PGVector
    """
    try:
        config = PGVectorManager.get_config()
        logger.info(
            f"Deleting vectors for video ID: {video_id} from collection: {config['collection_name']}"
        )

        def delete_operation(cursor):
            # Filter by video_id and delete in one operation
            delete_query = """
                DELETE FROM langchain_pg_embedding 
                WHERE cmetadata->>'video_id' = %s
            """
            cursor.execute(delete_query, (str(video_id),))
            return cursor.rowcount

        deleted_count = PGVectorManager.execute_with_connection(delete_operation)

        if deleted_count > 0:
            logger.info(
                f"Successfully deleted {deleted_count} vector documents for video ID: {video_id}"
            )
        else:
            logger.info(f"No vector documents found for video ID: {video_id}")

    except Exception as e:
        logger.warning(
            f"Failed to delete vectors for video ID {video_id}: {e}", exc_info=True
        )


def delete_video_vectors_batch(video_ids):
    """
    Batch delete vector data related to multiple video IDs
    """
    if not video_ids:
        return

    try:
        config = PGVectorManager.get_config()
        logger.info(
            f"Batch deleting vectors for {len(video_ids)} videos from collection: {config['collection_name']}"
        )

        def batch_delete_operation(cursor):
            # Delete multiple video_ids at once
            video_id_strs = [str(vid) for vid in video_ids]
            placeholders = ",".join(["%s"] * len(video_id_strs))

            delete_query = f"""
                DELETE FROM langchain_pg_embedding 
                WHERE cmetadata->>'video_id' = ANY(ARRAY[{placeholders}])
            """
            cursor.execute(delete_query, video_id_strs)
            return cursor.rowcount

        deleted_count = PGVectorManager.execute_with_connection(batch_delete_operation)

        if deleted_count > 0:
            logger.info(
                f"Successfully batch deleted {deleted_count} vector documents for {len(video_ids)} videos"
            )
        else:
            logger.info(
                f"No vector documents found for the batch of {len(video_ids)} videos"
            )

    except Exception as e:
        logger.warning(
            f"Failed to batch delete vectors for videos {video_ids}: {e}", exc_info=True
        )


def update_video_title_in_vectors(video_id, new_title):
    """
    Update video_title in PGVector metadata

    Args:
        video_id: Video ID
        new_title: New title

    Returns:
        int: Number of documents updated
    """
    try:

        def update_operation(cursor):
            update_query = """
                UPDATE langchain_pg_embedding
                SET cmetadata = jsonb_set(
                    cmetadata::jsonb,
                    '{video_title}',
                    to_jsonb(%s::text)
                )
                WHERE cmetadata->>'video_id' = %s
            """
            cursor.execute(update_query, (new_title, str(video_id)))
            return cursor.rowcount

        updated_count = PGVectorManager.execute_with_connection(update_operation)

        if updated_count > 0:
            logger.info(
                f"Updated video_title to '{new_title}' for {updated_count} vector documents (video ID: {video_id})"
            )
        else:
            logger.info(f"No vector documents found to update for video ID: {video_id}")

        return updated_count

    except Exception as e:
        logger.warning(
            f"Failed to update video_title in PGVector for video {video_id}: {e}",
            exc_info=True,
        )
        return 0


def delete_all_vectors():
    """
    Delete all vector data from PGVector collection
    Used when re-indexing all videos with a new embedding model

    Returns:
        int: Number of documents deleted
    """
    try:
        config = PGVectorManager.get_config()
        logger.info(
            f"Deleting all vectors from collection: {config['collection_name']}"
        )

        def delete_all_operation(cursor):
            delete_query = """
                DELETE FROM langchain_pg_embedding
                WHERE collection_id IN (
                    SELECT uuid FROM langchain_pg_collection WHERE name = %s
                )
            """
            cursor.execute(delete_query, (config["collection_name"],))
            return cursor.rowcount

        deleted_count = PGVectorManager.execute_with_connection(delete_all_operation)

        if deleted_count > 0:
            logger.info(
                f"Successfully deleted {deleted_count} vector documents from collection: {config['collection_name']}"
            )
        else:
            logger.info(
                f"No vector documents found in collection: {config['collection_name']}"
            )

        return deleted_count

    except Exception as e:
        logger.error(
            f"Failed to delete all vectors from collection: {e}", exc_info=True
        )
        raise
