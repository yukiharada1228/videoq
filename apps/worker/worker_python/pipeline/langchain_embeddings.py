"""One validated provider adapter for PGVectorStore and RAGAS."""

from langchain_core.embeddings import Embeddings

from .embeddings import embed_texts


class VideoQEmbeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return embed_texts(texts)

    def embed_query(self, text: str) -> list[float]:
        return embed_texts([text])[0]
