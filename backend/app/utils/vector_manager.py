"""
Unified management of PGVectorStore operations
"""

import logging
import os
import threading

from django.conf import settings
from langchain_postgres import Column, PGEngine, PGVectorStore

logger = logging.getLogger(__name__)


class PGVectorManager:
    """
    Unified management class for PGVectorStore operations.
    Manages PGEngine singleton and vectorstore table initialization.
    """

    _engine = None
    _engine_lock = threading.Lock()
    _table_initialized = False
    _table_init_lock = threading.Lock()

    @classmethod
    def get_engine(cls):
        """Get or create the PGEngine singleton (thread-safe)."""
        if cls._engine is None:
            with cls._engine_lock:
                if cls._engine is None:
                    db_url = os.getenv(
                        "DATABASE_URL",
                        "postgresql://postgres:postgres@postgres:5432/postgres",
                    )
                    # PGEngine requires postgresql+psycopg:// format
                    if db_url.startswith("postgresql://"):
                        db_url = db_url.replace(
                            "postgresql://", "postgresql+psycopg://", 1
                        )
                    elif db_url.startswith("postgres://"):
                        db_url = db_url.replace(
                            "postgres://", "postgresql+psycopg://", 1
                        )
                    cls._engine = PGEngine.from_connection_string(url=db_url)
        return cls._engine

    @classmethod
    def get_table_name(cls):
        """Get the vectorstore table name (= collection name)."""
        return getattr(
            settings,
            "PGVECTOR_COLLECTION_NAME",
            os.getenv("PGVECTOR_COLLECTION_NAME", "videoq_scenes"),
        )

    @classmethod
    def get_vector_size(cls):
        """Get the embedding vector dimension size."""
        return getattr(settings, "EMBEDDING_VECTOR_SIZE", 1536)

    @classmethod
    def ensure_table(cls):
        """Ensure the vectorstore table exists (idempotent, thread-safe)."""
        if cls._table_initialized:
            return
        with cls._table_init_lock:
            if cls._table_initialized:
                return
            engine = cls.get_engine()
            try:
                engine.init_vectorstore_table(
                    table_name=cls.get_table_name(),
                    vector_size=cls.get_vector_size(),
                    metadata_columns=[
                        Column("user_id", "INTEGER"),
                        Column("video_id", "INTEGER"),
                    ],
                )
            except Exception as e:
                if "already exists" in str(e):
                    logger.debug(
                        "Vectorstore table '%s' already exists",
                        cls.get_table_name(),
                    )
                else:
                    raise
            cls._table_initialized = True

    @classmethod
    def create_vectorstore(cls, embeddings):
        """Create a PGVectorStore instance (sync)."""
        cls.ensure_table()
        engine = cls.get_engine()
        return PGVectorStore.create_sync(
            engine=engine,
            embedding_service=embeddings,
            table_name=cls.get_table_name(),
            metadata_columns=["user_id", "video_id"],
        )

    @classmethod
    def _get_management_store(cls):
        """Get a PGVectorStore for management operations (no real embeddings needed)."""
        from langchain_core.embeddings import FakeEmbeddings

        fake_embeddings = FakeEmbeddings(size=cls.get_vector_size())
        return cls.create_vectorstore(fake_embeddings)


def delete_video_vectors(video_id):
    """
    Delete vector data related to the specified video ID using PGVectorStore filter.
    """
    try:
        logger.info("Deleting vectors for video ID: %s", video_id)

        store = PGVectorManager._get_management_store()
        store.delete(filter={"video_id": int(video_id)})

        logger.info("Deleted vectors for video ID: %s", video_id)

    except Exception as e:
        logger.warning(
            "Failed to delete vectors for video ID %s: %s", video_id, e, exc_info=True
        )


def update_video_title_in_vectors(video_id, new_title):
    """
    Update video_title in PGVectorStore metadata.
    Uses raw SQL since PGVectorStore has no update API.

    Args:
        video_id: Video ID
        new_title: New title

    Returns:
        int: Number of documents updated
    """
    try:
        from django.db import connection

        table = connection.ops.quote_name(PGVectorManager.get_table_name())

        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE {}
                SET langchain_metadata = jsonb_set(
                    COALESCE(langchain_metadata::jsonb, '{{}}'::jsonb),
                    '{{video_title}}',
                    to_jsonb(%s::text)
                )
                WHERE video_id = %s
                """.format(
                    table
                ),
                [new_title, int(video_id)],
            )
            updated_count = cursor.rowcount

        if updated_count > 0:
            logger.info(
                "Updated video_title to '%s' for %d vectors (video ID: %s)",
                new_title,
                updated_count,
                video_id,
            )
        else:
            logger.info("No vectors found to update for video ID: %s", video_id)

        return updated_count

    except Exception as e:
        logger.warning(
            "Failed to update video_title in vectors for video %s: %s",
            video_id,
            e,
            exc_info=True,
        )
        return 0


def delete_all_vectors():
    """
    Delete all vector data from the collection table.
    Used when re-indexing all videos with a new embedding model.

    Returns:
        int: Number of documents deleted
    """
    try:
        from django.db import connection

        table_name = PGVectorManager.get_table_name()
        logger.info("Deleting all vectors from table: %s", table_name)

        quoted_table = connection.ops.quote_name(table_name)
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM {}".format(quoted_table))
            deleted_count = cursor.rowcount

        if deleted_count > 0:
            logger.info("Deleted %d vectors from %s", deleted_count, table_name)
        else:
            logger.info("No vectors in table %s", table_name)

        return deleted_count

    except Exception as e:
        logger.error("Failed to delete all vectors: %s", e, exc_info=True)
        raise
