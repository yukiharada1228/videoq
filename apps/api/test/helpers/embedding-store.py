"""Python half of the cross-language PGVectorStore integration test."""

import os
from unittest.mock import patch

from langchain_postgres.v2.indexes import HNSWIndex

from worker_python.pipeline import vector_index
from worker_python.video_sql import VideoRow


def embed(texts):
    return [[1.0 if i == 0 else 0.0 for i in range(1536)] for _ in texts]


with patch.object(vector_index, "embed_texts", side_effect=embed):
    for owner, video_id in [("allowed-owner", 60), ("other-owner", 61), ("allowed-owner", 62)]:
        row = VideoRow(
            id=video_id, user_id=owner, title=f"Video {video_id}",
            transcript="1\n00:00:00,000 --> 00:00:05,000\nWater evaporates when heated.\n",
            status="completed", source_type="uploaded", file_key=None,
            youtube_video_id=None, error_message="",
        )
        assert vector_index.index_video_transcript(row) == 1

with vector_index._vector_store() as store:
    store.apply_vector_index(HNSWIndex(name="python_embedding_hnsw"))
    result = store.similarity_search_by_vector(embed(["query"])[0], k=3, filter={"user_id": "allowed-owner", "video_id": 60})
    assert len(result) == 1 and result[0].metadata["video_id"] == 60
    store.drop_vector_index("python_embedding_hnsw")
# Pure cleanup must remain available without any usable model configuration.
os.environ["EMBEDDING_PROVIDER"] = "invalid"
os.environ.pop("OPENAI_API_KEY", None)
assert vector_index.delete_video_vectors(61) == 1
print("python_save_search_hnsw_ok")
