"""PGVectorStore indexing into the shared scene_embeddings table."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager

from langchain_core.embeddings import Embeddings
from langchain_postgres import PGEngine, PGVectorStore

from worker_python.db import db_connection, get_database_url
from worker_python.env import env_str
from worker_python.pipeline.embeddings import embed_texts
from worker_python.pipeline.srt import parse_srt_scenes
from worker_python.video_sql import VideoRow

logger = logging.getLogger(__name__)

ALLOWED_TABLES = frozenset({"scene_embeddings"})


def _table_name() -> str:
    name = env_str("PGVECTOR_COLLECTION_NAME", "scene_embeddings")
    if name not in ALLOWED_TABLES:
        raise ValueError(f"vector table '{name}' is not in the allowed list")
    return name


def _sqlalchemy_database_url() -> str:
    url = get_database_url()
    if url.startswith("postgresql+"):
        return url
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")
    raise RuntimeError("DATABASE_URL must use a PostgreSQL URL")


class VideoQEmbeddings(Embeddings):
    """Expose the configured VideoQ provider through LangChain's interface."""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return embed_texts(texts)

    def embed_query(self, text: str) -> list[float]:
        vectors = embed_texts([text])
        if not vectors:
            raise RuntimeError("Embedding provider returned no query vector")
        return vectors[0]


@contextmanager
def _vector_store() -> Iterator[PGVectorStore]:
    engine = PGEngine.from_connection_string(url=_sqlalchemy_database_url())
    try:
        yield PGVectorStore.create_sync(
            engine=engine,
            table_name=_table_name(),
            embedding_service=VideoQEmbeddings(),
            metadata_columns=["user_id", "video_id"],
        )
    finally:
        engine.close()


def _count_vectors(metadata_key: str | None = None, value: int | None = None) -> int:
    table = _table_name()
    with db_connection() as conn:
        if metadata_key is None:
            row = conn.execute(f'SELECT count(*) AS count FROM "{table}"').fetchone()
        else:
            if metadata_key not in {"video_id", "user_id"}:
                raise ValueError(f"unsupported metadata key: {metadata_key}")
            row = conn.execute(
                f'SELECT count(*) AS count FROM "{table}" WHERE "{metadata_key}" = %s',
                (value,),
            ).fetchone()
    return int(row["count"]) if row else 0


def delete_video_vectors(video_id: int) -> int:
    deleted = _count_vectors("video_id", video_id)
    with _vector_store() as store:
        store.delete(filter={"video_id": video_id})
    logger.info("Deleted %d vector rows for video %d", deleted, video_id)
    return deleted


def delete_all_vectors() -> int:
    deleted = _count_vectors()
    with _vector_store() as store:
        if deleted:
            store.delete(filter={"user_id": {"$exists": True}})
    logger.info("Deleted %d vector rows (all)", deleted)
    return deleted


def index_video_transcript(video: VideoRow) -> int:
    """Parse SRT scenes, embed, and insert into scene_embeddings. Returns inserted count."""
    if not video.transcript:
        raise ValueError(f"Video {video.id} has no transcript")

    scenes = parse_srt_scenes(video.transcript)
    if not scenes:
        logger.info("No SRT scenes for video %d; skipping vector index", video.id)
        return 0

    texts = [s.text for s in scenes]
    # Batch embeddings in chunks to avoid provider limits.
    embeddings: list[list[float]] = []
    batch_size = 64
    for i in range(0, len(texts), batch_size):
        embeddings.extend(embed_texts(texts[i : i + batch_size]))

    metadatas = [
        {
            "video_id": video.id,
            "user_id": video.user_id,
            "video_title": video.title,
            "start_time": scene.start_time,
            "end_time": scene.end_time,
            "start_sec": scene.start_sec,
            "end_sec": scene.end_sec,
            "scene_index": scene.index,
        }
        for scene in scenes
    ]
    ids = [str(uuid.uuid4()) for _ in scenes]

    with _vector_store() as store:
        store.delete(filter={"video_id": video.id})
        inserted_ids = store.add_embeddings(
            texts=texts,
            embeddings=embeddings,
            metadatas=metadatas,
            ids=ids,
        )
    inserted = len(inserted_ids)

    logger.info("Indexed %d scenes for video %d into %s", inserted, video.id, _table_name())
    return inserted
