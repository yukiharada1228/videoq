"""
Vector indexing utilities for RAG
"""

import logging

from langchain_postgres import PGVector

from app.tasks.srt_processing import parse_srt_scenes
from app.utils.embeddings import get_embeddings
from app.utils.vector_manager import PGVectorManager

logger = logging.getLogger(__name__)


def index_scenes_to_vectorstore(scene_docs, video, api_key=None, collection_name=None):
    """
    Create vector index using LangChain + pgvector
    scene_docs: [{text, metadata}]
    api_key: Optional API key for OpenAI (uses environment variable if not provided)
    collection_name: Optional custom collection name
    """
    try:
        embeddings = get_embeddings(api_key)
        config = PGVectorManager.get_config()
        
        target_collection = collection_name or config["collection_name"]

        valid_docs = [d for d in scene_docs if d.get("text")]
        texts = [d["text"] for d in valid_docs]
        metadatas = [d.get("metadata", {}) for d in valid_docs]

        if not texts:
            logger.info("No valid texts to index, skipping pgvector indexing")
            return

        logger.info(
            f"Indexing {len(texts)} scenes to pgvector collection: {target_collection}"
        )

        # Create vector store with pgvector
        # langchain_postgres uses psycopg3, so convert connection string
        # postgresql:// → postgresql+psycopg://
        connection_str = config["database_url"]
        if connection_str.startswith("postgresql://"):
            connection_str = connection_str.replace(
                "postgresql://", "postgresql+psycopg://", 1
            )

        PGVector.from_texts(
            texts=texts,
            embedding=embeddings,
            collection_name=target_collection,
            connection=connection_str,  # langchain_postgres uses connection parameter (psycopg3 format)
            metadatas=metadatas,
            use_jsonb=True,  # Enable JSONB filtering
        )

        logger.info(f"Successfully indexed {len(texts)} scenes to pgvector")

    except Exception as e:
        logger.warning(f"Indexing to pgvector failed: {e}", exc_info=True)


def create_scene_metadata(video, scene):
    """
    Create scene metadata
    """
    metadata = {
        "video_id": video.id,
        "user_id": video.user_id,
        "video_title": video.title,
        "start_time": scene["start_time"],
        "end_time": scene["end_time"],
        "start_sec": scene["start_sec"],
        "end_sec": scene["end_sec"],
        "scene_index": scene["index"],
    }

    # Add external_id if it exists
    if video.external_id:
        metadata["external_id"] = video.external_id

    return metadata


def index_scenes_batch(scene_split_srt, video, api_key=None, collection_name=None):
    """
    Batch index scenes to pgvector
    api_key: Optional API key for OpenAI (uses environment variable if not provided)
    collection_name: Optional custom collection name
    """
    try:
        logger.info("Starting scene indexing to pgvector...")
        scenes = parse_srt_scenes(scene_split_srt)
        logger.info(f"Parsed {len(scenes)} scenes from SRT")

        scene_docs = [
            {
                "text": sc["text"],
                "metadata": create_scene_metadata(video, sc),
            }
            for sc in scenes
        ]

        logger.info(f"Prepared {len(scene_docs)} scene documents for indexing")
        index_scenes_to_vectorstore(scene_docs, video, api_key, collection_name)

    except Exception as e:
        logger.warning(f"Failed to prepare scenes for indexing: {e}", exc_info=True)
        raise  # Re-raise exception for caller to handle
