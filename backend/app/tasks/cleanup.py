import logging
import re

from celery import shared_task
from django.conf import settings
from langchain_postgres import PGVector
from langchain_postgres.vectorstores import PGVector as PGVectorStore

from app.utils.vector_manager import PGVectorManager, delete_collection

logger = logging.getLogger(__name__)


@shared_task(name="cleanup_orphaned_vectors")
def cleanup_orphaned_vectors():
    """
    Periodic task to clean up orphaned vector collections (e.g., failed reindexing attempts).
    Scans for collections matching the pattern 'temp_reindex_*' and deletes them.
    """
    logger.info("Starting cleanup of orphaned vector collections...")
    
    # Get configuration safely
    try:
        connection_string = PGVectorManager.get_connection_string()
    except Exception as e:
        logger.error(f"Failed to get connection string: {e}")
        return

    # Pattern for temp collections: temp_reindex_{video_id}_{uuid}
    temp_pattern = "temp_reindex_"

    try:
        # Currently, langchain-postgres doesn't expose a list_collections method directly
        # on the object interface easily without deeper access.
        # We will use raw SQL to find tables that match our pattern.
        # PGVector collections are typically stored as tables in langchain_pg_collection 
        # but the vectors are in langchain_pg_embedding.
        # However, checking the library, collections are rows in `langchain_pg_collection`.
        
        # We will use the PGVectorManager's delete_collection logic approach which creates a store.
        # But to LIST them, we need a direct DB connection or a way via the store.
        # Since we don't have a direct 'list_collections' utility, we'll implement a safe SQL check.
        
        from django.db import connection

        with connection.cursor() as cursor:
            # Query to find orphaned collections
            cursor.execute(
                "SELECT name FROM langchain_pg_collection WHERE name LIKE %s",
                [f"{temp_pattern}%"]
            )
            rows = cursor.fetchall()
            orphaned_collections = [row[0] for row in rows]

        if not orphaned_collections:
            logger.info("No orphaned collections found.")
            return

        logger.info(f"Found {len(orphaned_collections)} orphaned collections: {orphaned_collections}")

        for collection_name in orphaned_collections:
            try:
                # Use our safe delete utility
                delete_collection(collection_name)
                logger.info(f"Deleted orphaned collection: {collection_name}")
            except Exception as e:
                logger.error(f"Failed to delete collection {collection_name}: {e}")

    except Exception as e:
        logger.error(f"Error during orphaned vector cleanup: {e}", exc_info=True)
