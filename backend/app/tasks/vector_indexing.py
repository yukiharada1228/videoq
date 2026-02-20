"""
Vector indexing utilities for RAG
"""

import logging

from app.tasks.srt_processing import parse_srt_scenes
from app.utils.embeddings import get_embeddings
from app.utils.vector_manager import PGVectorManager

logger = logging.getLogger(__name__)


def index_scenes_to_vectorstore(scene_docs, video, api_key=None):
    """
    Create vector index using PGVectorStore.
    scene_docs: [{text, metadata}]
    api_key: Optional API key for OpenAI (uses environment variable if not provided)
    """
    try:
        embeddings = get_embeddings(api_key)

        valid_docs = [d for d in scene_docs if d.get("text")]
        texts = [d["text"] for d in valid_docs]
        metadatas = [d.get("metadata", {}) for d in valid_docs]

        if not texts:
            logger.info("No valid texts to index, skipping vectorstore indexing")
            return

        logger.info(
            "Indexing %d scenes to vectorstore table: %s",
            len(texts),
            PGVectorManager.get_table_name(),
        )

        store = PGVectorManager.create_vectorstore(embeddings)
        store.add_texts(texts=texts, metadatas=metadatas)

        logger.info("Successfully indexed %d scenes to vectorstore", len(texts))

    except Exception as e:
        logger.warning("Indexing to vectorstore failed: %s", e, exc_info=True)


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


def index_scenes_batch(scene_split_srt, video, api_key=None):
    """
    Batch index scenes to vectorstore.
    api_key: Optional API key for OpenAI (uses environment variable if not provided)
    """
    try:
        logger.info("Starting scene indexing to vectorstore...")
        scenes = parse_srt_scenes(scene_split_srt)
        logger.info("Parsed %d scenes from SRT", len(scenes))

        scene_docs = [
            {
                "text": sc["text"],
                "metadata": create_scene_metadata(video, sc),
            }
            for sc in scenes
        ]

        logger.info("Prepared %d scene documents for indexing", len(scene_docs))
        index_scenes_to_vectorstore(scene_docs, video, api_key)

    except Exception as e:
        logger.warning("Failed to prepare scenes for indexing: %s", e, exc_info=True)
        raise  # Re-raise exception for caller to handle
