"""
Celery tasks package for video transcription
"""


from .audio_processing import extract_audio
from .reindexing import reindex_all_videos_embeddings

__all__ = [
    "extract_audio",
    "reindex_all_videos_embeddings",
]
