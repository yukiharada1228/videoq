import tiktoken
from openai import OpenAI

from .models import VideoGroup


def count_tokens(text: str, model: str = "text-embedding-3-small") -> int:
    """
    Count tokens in text
    """
    try:
        encoding = tiktoken.encoding_for_model(model)
        return len(encoding.encode(text))
    except Exception as e:
        print(f"Error counting tokens: {e}")
        # Fallback: rough estimate (4 characters = 1 token for English, 1 character = 1 token for Japanese)
        return len(text) // 4


def truncate_text_to_token_limit(
    text: str, max_tokens: int = 8000, model: str = "text-embedding-3-small"
) -> str:
    """
    Keep text within token limits (improved version)
    """
    if count_tokens(text, model) <= max_tokens:
        return text

    # If token count exceeds limit, truncate text
    encoding = tiktoken.encoding_for_model(model)
    tokens = encoding.encode(text)

    if len(tokens) > max_tokens:
        # Better truncation method: keep both beginning and end
        front_tokens = tokens[: max_tokens // 2]  # First half
        back_tokens = tokens[-(max_tokens // 2) :]  # Second half

        # Combine avoiding overlap
        if len(front_tokens) + len(back_tokens) > max_tokens:
            # If overlap is large, use only the beginning part
            truncated_tokens = tokens[:max_tokens]
            truncated_text = encoding.decode(truncated_tokens)
        else:
            # Combine beginning and end
            truncated_text = (
                encoding.decode(front_tokens) + "..." + encoding.decode(back_tokens)
            )

        print(
            f"Text truncated from {len(tokens)} to {count_tokens(truncated_text)} tokens"
        )
        return truncated_text

    return text


class VectorSearchService:
    """Video group search service using OpenSearch/Pinecone (using OpenAI official API)"""

    def __init__(self, api_key):
        self.api_key = api_key
        self.client = OpenAI(api_key=self.api_key)

    def embed_query(self, query: str):
        # Check token count and truncate if necessary
        token_count = count_tokens(query)
        if token_count > 8000:
            query = truncate_text_to_token_limit(query)
            print(f"Query truncated from {token_count} to {count_tokens(query)} tokens")

        # Vectorize query using OpenAI official API
        response = self.client.embeddings.create(
            model="text-embedding-3-small", input=query, encoding_format="float"
        )
        return response.data[0].embedding

    def search_group_chunks(self, group: VideoGroup, query: str, max_results: int = 5):
        # Not implemented as VideoChunk is deprecated
        raise NotImplementedError(
            "VideoChunk is deprecated and managed by Pinecone serverless. Please do not use this method."
        )

    def search_group_features(
        self, group: VideoGroup, query: str, max_results: int = 5
    ):
        # Not implemented as VideoFeature is deprecated
        raise NotImplementedError(
            "VideoFeature is deprecated and subtitle/timestamp search functionality is not available."
        )

    def search_group_all(self, group: VideoGroup, query: str, max_results: int = 5):
        """Return both chunks and timestamps together"""
        return {
            "group_results": self.search_group_chunks(group, query, max_results),
            "group_timestamp_results": self.search_group_features(
                group, query, max_results
            ),
            "query": query,
            "group_name": group.name,
        }

    def generate_group_rag_answer(self, group, query, max_results=5):
        # Search for similar chunks
        context_chunks = self.search_group_chunks(group, query, max_results)
        if not context_chunks:
            return {
                "rag_answer": "I apologize, but no relevant content was found for this question.",
                "timestamp_results": [],
                "query": query,
                "group_name": group.name,
            }

        # Create context
        context_text = "\n\n".join(
            [
                f"[{c['video_title']} - {c['start_time']:.1f}s-{c['end_time']:.1f}s] {c['text']}"
                for c in context_chunks
            ]
        )

        # Create prompt
        prompt = f"""You are an assistant that answers questions about the content of the video group "{group.name}".

Based on the given context (transcription of the video group), provide accurate and concise answers to questions within 200 characters.

Context:
{context_text}

Question: {query}

Answer:"""

        # Generate answer using OpenAI API
        response = self.client.chat.completions.create(
            model="gpt-4o-mini-2024-07-18",
            messages=[
                {
                    "role": "system",
                    "content": "You are an assistant that answers questions based on video group content.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=300,
            temperature=0.3,
        )
        rag_answer = response.choices[0].message.content.strip()

        # Also search for related timestamps
        timestamp_results = self.search_group_features(group, rag_answer, max_results)

        return {
            "rag_answer": rag_answer,
            "timestamp_results": timestamp_results,
            "query": query,
            "group_name": group.name,
        }
