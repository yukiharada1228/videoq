"""
Unified management of PGVector operations
"""

import logging
import os
from typing import Callable, Optional

import psycopg2
from pgvector.psycopg2 import register_vector

logger = logging.getLogger(__name__)


class PGVectorManager:
    """
    Unified management class for PGVector operations.
    Supports dependency injection for configuration and connection.
    """

    _config = None
    _connection = None
    _config_provider: Optional[Callable[[], dict]] = None

    @classmethod
    def set_config_provider(cls, provider: Callable[[], dict]) -> None:
        """
        Set a custom configuration provider for dependency injection.

        Args:
            provider: Callable that returns a config dict with 'database_url' and 'collection_name'
        """
        cls.close_connection()  # Close existing connection before changing provider
        cls._config_provider = provider
        cls._config = None  # Reset config to use new provider

    @classmethod
    def reset(cls) -> None:
        """
        Reset manager state. Useful for testing.
        """
        cls.close_connection()  # Close existing connection before reset
        cls._config = None
        cls._connection = None
        cls._config_provider = None

    @classmethod
    def get_config(cls):
        """
        Get PGVector configuration (singleton pattern)
        Supports custom config provider for DI
        """
        if cls._config is None:
            if cls._config_provider is not None:
                cls._config = cls._config_provider()
            else:
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

def move_vectors_to_collection(
    source_collection, target_collection, video_id=None
):
    """
    Move vectors from source collection to target collection.
    If video_id is provided, only moves vectors for that video.
    """
    try:
        def move_operation(cursor):
            # 1. Get collection UUIDs
            cursor.execute(
                "SELECT uuid FROM langchain_pg_collection WHERE name = %s",
                (source_collection,)
            )
            source_res = cursor.fetchone()
            if not source_res:
                return 0
            source_uuid = source_res[0]

            cursor.execute(
                "SELECT uuid FROM langchain_pg_collection WHERE name = %s",
                (target_collection,)
            )
            target_res = cursor.fetchone()
            if not target_res:
                # Target collection might not exist yet if it's empty, 
                # but usually it should if initialized. 
                # If using LangChain PGVector, it handles creation. 
                # Assuming target exists for now or handled by caller.
                # If not, we can't move to non-existent collection easily without creating it.
                return 0
            target_uuid = target_res[0]

            # 2. Update collection_id
            query = """
                UPDATE langchain_pg_embedding
                SET collection_id = %s
                WHERE collection_id = %s
            """
            params = [target_uuid, source_uuid]

            if video_id is not None:
                query += " AND cmetadata->>'video_id' = %s"
                params.append(str(video_id))

            cursor.execute(query, params)
            return cursor.rowcount

        moved_count = PGVectorManager.execute_with_connection(move_operation)
        logger.info(
            f"Moved {moved_count} vectors from {source_collection} to {target_collection}"
        )
        return moved_count

    except Exception as e:
        logger.error(f"Failed to move vectors: {e}", exc_info=True)
        raise


def delete_collection(collection_name):
    """
    Delete a collection and all its embeddings
    """
    try:
        def delete_op(cursor):
            # 1. Delete embeddings first
            cursor.execute(
                """
                DELETE FROM langchain_pg_embedding 
                WHERE collection_id IN (
                    SELECT uuid FROM langchain_pg_collection WHERE name = %s
                )
                """,
                (collection_name,)
            )
            embeddings_count = cursor.rowcount

            # 2. Delete collection
            cursor.execute(
                "DELETE FROM langchain_pg_collection WHERE name = %s",
                (collection_name,)
            )
            return cursor.rowcount, embeddings_count

        _, docs_count = PGVectorManager.execute_with_connection(delete_op)
        logger.info(f"Deleted collection: {collection_name} and {docs_count} embeddings")
    except Exception as e:
        logger.warning(f"Failed to delete collection {collection_name}: {e}")

def swap_video_vectors(video_id, temp_collection, main_collection):
    """
    Atomically swap vectors for a video:
    1. Delete existing vectors for video_id in main_collection (if any)
    2. Move new vectors from temp_collection to main_collection
    All within a single transaction.
    """
    try:
        def swap_operation(cursor):
            # 1. Delete old vectors
            cursor.execute(
                """
                DELETE FROM langchain_pg_embedding 
                WHERE cmetadata->>'video_id' = %s
                """,
                (str(video_id),)
            )
            deleted_count = cursor.rowcount

            # 2. Move new vectors
            # Get collection UUIDs
            cursor.execute(
                "SELECT uuid FROM langchain_pg_collection WHERE name = %s",
                (temp_collection,)
            )
            source_res = cursor.fetchone()
            if not source_res:
                raise Exception(f"Source collection {temp_collection} not found")
            source_uuid = source_res[0]

            cursor.execute(
                "SELECT uuid FROM langchain_pg_collection WHERE name = %s",
                (main_collection,)
            )
            target_res = cursor.fetchone()
            if not target_res:
                 # If target doesn't exist, we can't move easily. 
                 # In this app flow, main collection should exist.
                 raise Exception(f"Target collection {main_collection} not found")
            target_uuid = target_res[0]

            # Move vectors
            cursor.execute(
                """
                UPDATE langchain_pg_embedding
                SET collection_id = %s
                WHERE collection_id = %s
                """,
                (target_uuid, source_uuid)
            )
            moved_count = cursor.rowcount
            
            return deleted_count, moved_count

        deleted, moved = PGVectorManager.execute_with_connection(swap_operation)
        logger.info(
            f"Atomically swapped vectors for video {video_id}: "
            f"Deleted {deleted} old, Moved {moved} new from {temp_collection} to {main_collection}"
        )
        return True
    except Exception as e:
        logger.error(f"Failed to swap vectors for video {video_id}: {e}", exc_info=True)
        raise
