from __future__ import annotations

from contextlib import contextmanager

from worker_python.pipeline import vector_index
from worker_python.video_sql import VideoRow


class FakeStore:
    def __init__(self) -> None:
        self.deleted: list[dict] = []
        self.added: dict | None = None

    def delete(self, *, ids=None, filter=None) -> bool:
        self.deleted.append({"ids": ids, "filter": filter})
        return True

    def add_embeddings(self, **kwargs):
        self.added = kwargs
        return kwargs["ids"]


def use_fake_store(monkeypatch, store: FakeStore) -> None:
    @contextmanager
    def factory():
        yield store

    monkeypatch.setattr(vector_index, "_vector_store", factory)


def test_vector_store_uses_standard_schema_and_closes_engine(monkeypatch) -> None:
    store = FakeStore()
    captured: dict = {"closed": 0}

    class FakeEngine:
        def close(self) -> None:
            captured["closed"] += 1

    engine = FakeEngine()
    monkeypatch.setattr(
        vector_index.PGEngine,
        "from_connection_string",
        lambda *, url: captured.update(url=url) or engine,
    )
    monkeypatch.setattr(
        vector_index.PGVectorStore,
        "create_sync",
        lambda **kwargs: captured.update(create=kwargs) or store,
    )
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@db/videoq")

    with vector_index._vector_store() as actual:
        assert actual is store

    assert captured["closed"] == 1
    assert captured["url"] == "postgresql+psycopg://user:pass@db/videoq"
    assert captured["create"]["engine"] is engine
    assert captured["create"]["table_name"] == "scene_embeddings"
    assert isinstance(captured["create"]["embedding_service"], vector_index.VideoQEmbeddings)
    assert captured["create"]["metadata_columns"] == ["user_id", "video_id"]
    assert set(captured["create"]) == {
        "engine",
        "table_name",
        "embedding_service",
        "metadata_columns",
    }


def test_index_video_transcript_uses_pgvectorstore_with_standard_metadata(
    monkeypatch,
) -> None:
    store = FakeStore()
    use_fake_store(monkeypatch, store)
    monkeypatch.setattr(
        vector_index,
        "embed_texts",
        lambda texts: [[float(index), 0.5] for index, _ in enumerate(texts)],
    )
    video = VideoRow(
        id=12,
        user_id=7,
        title="Demo",
        transcript=(
            "1\n00:00:00,000 --> 00:00:01,000\nFirst\n\n"
            "2\n00:00:01,000 --> 00:00:02,000\nSecond"
        ),
        status="INDEXING",
        source_type="uploaded",
        file_key=None,
        youtube_video_id=None,
        error_message="",
    )

    inserted = vector_index.index_video_transcript(video)

    assert inserted == 2
    assert store.deleted == [{"ids": None, "filter": {"video_id": 12}}]
    assert store.added is not None
    assert store.added["texts"] == ["First", "Second"]
    assert store.added["embeddings"] == [[0.0, 0.5], [1.0, 0.5]]
    assert store.added["metadatas"][0] == {
        "video_id": 12,
        "user_id": 7,
        "video_title": "Demo",
        "start_time": "00:00:00,000",
        "end_time": "00:00:01,000",
        "start_sec": 0.0,
        "end_sec": 1.0,
        "scene_index": 1,
    }
    assert len(store.added["ids"]) == 2


def test_delete_video_vectors_deletes_selected_ids_through_store(monkeypatch) -> None:
    store = FakeStore()
    use_fake_store(monkeypatch, store)
    monkeypatch.setattr(
        vector_index,
        "_count_vectors",
        lambda key=None, value=None: 2,
    )

    deleted = vector_index.delete_video_vectors(9)

    assert deleted == 2
    assert store.deleted == [{"ids": None, "filter": {"video_id": 9}}]


def test_delete_all_vectors_uses_metadata_column_filter(monkeypatch) -> None:
    store = FakeStore()
    use_fake_store(monkeypatch, store)
    monkeypatch.setattr(
        vector_index,
        "_count_vectors",
        lambda key=None, value=None: 501,
    )

    deleted = vector_index.delete_all_vectors()

    assert deleted == 501
    assert store.deleted == [
        {"ids": None, "filter": {"user_id": {"$exists": True}}},
    ]
