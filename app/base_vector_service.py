import os
from abc import ABC, abstractmethod
from typing import Any, Dict, Generator, List

import tiktoken
from openai import OpenAI
from pydantic import BaseModel, Field

from app.models import VideoGroup


class RelatedQuestion(BaseModel):
    question: str = Field(..., description="Natural question related to context")


class RelatedQuestionsResponse(BaseModel):
    questions: List[RelatedQuestion]


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


def truncate_text_to_token_limit(text: str, max_tokens: int = 8000) -> str:
    """
    Keep text within token limits
    """
    encoding = tiktoken.encoding_for_model("text-embedding-3-small")
    tokens = encoding.encode(text)

    if len(tokens) <= max_tokens:
        return text

    # Keep within token limits
    truncated_tokens = tokens[:max_tokens]
    return encoding.decode(truncated_tokens)


class BaseVectorService(ABC):
    """Base class for vector search service"""

    def __init__(
        self,
        user_id: int,
        openai_api_key: str | None = None,
        ensure_indexes: bool = True,
    ):
        if user_id is None:
            raise ValueError("user_id is required for namespace-based indexes")

        self.openai_api_key = openai_api_key
        self.user_id = user_id

        # Initialize OpenAI API client (only if API key is available)
        if openai_api_key:
            self.client = OpenAI(api_key=self.openai_api_key)
        else:
            self.client = None

        # Index names (fixed names)
        self.chunks_index_name = self._get_chunks_index_name()
        self.features_index_name = self._get_features_index_name()

        if ensure_indexes:
            try:
                self._ensure_indexes_exist()
            except Exception as e:
                print(f"Warning: Could not ensure indexes exist: {e}")

    @abstractmethod
    def _get_chunks_index_name(self) -> str:
        """Get chunks index name (fixed name)"""
        pass

    @abstractmethod
    def _get_features_index_name(self) -> str:
        """Get features index name (fixed name)"""
        pass

    @abstractmethod
    def _ensure_indexes_exist(self):
        """Ensure index exists"""
        pass

    @abstractmethod
    def search_group_chunks(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> List[Dict[str, Any]]:
        """Search chunks within group"""
        pass

    @abstractmethod
    def search_group_features(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> List[Dict[str, Any]]:
        """Search timestamped segments in group"""
        pass

    @abstractmethod
    def delete_video_data(self, video_id: int):
        """Delete data for specific video"""
        pass

    @abstractmethod
    def get_index_info(self) -> Dict[str, Any]:
        """Get index information"""
        pass

    def embed_query(self, query: str) -> List[float]:
        """Vectorize query"""
        if not self.client:
            raise ValueError("OpenAI API key is required for embedding queries")

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

    def search_group_all(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> Dict[str, Any]:
        """Return both chunks and timestamps together"""
        return {
            "group_results": self.search_group_chunks(group, query, max_results),
            "group_timestamp_results": self.search_group_features(
                group, query, max_results
            ),
            "query": query,
            "group_name": group.name,
        }

    def generate_related_questions(
        self,
        group: VideoGroup,
        context_chunks: List[Dict[str, Any]],
        max_questions: int = 3,
    ) -> List[Dict[str, str]]:
        """Generate 3 related questions based on context"""
        if not self.client:
            raise ValueError("OpenAI API key is required for question generation")

        if not context_chunks:
            return []

        context_text = "\n\n".join(
            [
                f"[{c['video_title']} - {c['start_time']:.1f}s-{c['end_time']:.1f}s] {c['text']}"
                for c in context_chunks
            ]
        )

        prompt = f"""Read the following context from video group "{group.name}" and generate exactly 3 related questions that users would be interested in.\n\n[Important] Prioritize generating questions directly related to the context content.\nCreate questions using terms and topics included in the context.\n\nContext:\n{context_text}\n\nPlease also consider:\n1. Content that users would want to understand deeply\n2. Natural and conversational questions"""

        try:
            response = self.client.responses.parse(
                model="gpt-4o-mini-2024-07-18",
                input=[
                    {
                        "role": "system",
                        "content": "You are an assistant that generates related questions based on video content.",
                    },
                    {"role": "user", "content": prompt},
                ],
                text_format=RelatedQuestionsResponse,
            )
            parsed_result = response.output_parsed
            questions = [q.model_dump() for q in parsed_result.questions]
            return questions
        except Exception as e:
            print(f"Error generating related questions: {e}")
            return []

    def generate_group_rag_answer(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> Dict[str, Any]:
        """Generate RAG answer using videos within group"""
        if not self.client:
            raise ValueError("OpenAI API key is required for RAG answer generation")

        # Get search results
        search_results = self.search_group_all(group, query, max_results)

        # Build context
        context_parts = []

        # Add chunk results
        for result in search_results["group_results"]:
            context_parts.append(
                f"Video: {result['video_title']} (Time: {result['start_time']:.1f}s-{result['end_time']:.1f}s)\nContent: {result['text']}"
            )

        # Add timestamp results
        for result in search_results["group_timestamp_results"]:
            context_parts.append(
                f"Video: {result['video_title']} (Time: {result['timestamp']:.1f}s)\nContent: {result['text']}"
            )

        context = "\n\n".join(context_parts)

        # Prompt for RAG answer generation
        prompt = f"""You are an assistant that answers questions about the content of video group "{group.name}".

Based on the given context (transcription of the video group), provide accurate and concise answers to questions within 200 characters.

Context:
{context}

Question: {query}

Answer:"""

        try:
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

            answer = response.choices[0].message.content

            return {
                "answer": answer,
                "context": context,
                "search_results": search_results,
                "query": query,
                "group_name": group.name,
            }

        except Exception as e:
            print(f"Error generating RAG answer: {e}")
            return {
                "answer": "I apologize, but an error occurred while generating the answer.",
                "context": context,
                "search_results": search_results,
                "query": query,
                "group_name": group.name,
                "error": str(e),
            }

    def generate_group_rag_answer_stream(
        self, group: VideoGroup, query: str, max_results: int = 5
    ) -> Generator[Dict[str, Any], None, None]:
        """Generate answer using RAG (streaming support)"""
        # Search for similar chunks
        context_chunks = self.search_group_chunks(group, query, max_results)
        if not context_chunks:
            yield {
                "type": "error",
                "message": "I apologize, but no relevant content was found for this question.",
            }
            return

        # Create context
        context_text = "\n\n".join(
            [
                f"[{c['video_title']} - {c['start_time']:.1f}s-{c['end_time']:.1f}s] {c['text']}"
                for c in context_chunks
            ]
        )

        # Create prompt
        prompt = f"""You are an assistant that answers questions about the content of video group "{group.name}".

Based on the given context (transcription of the video group), provide accurate and concise answers to questions within 200 characters.

Context:
{context_text}

Question: {query}

Answer:"""

        # Generate streaming answer using OpenAI API
        if not self.client:
            yield {
                "type": "error",
                "message": "OpenAI API key is required for RAG answer generation",
            }
            return

        try:
            stream = self.client.chat.completions.create(
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
                stream=True,
            )

            full_answer = ""
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    full_answer += content
                    yield {
                        "type": "content",
                        "content": content,
                        "full_answer": full_answer,
                    }

            # If complete answer is generated, also search for related timestamps
            timestamp_results = self.search_group_features(
                group, full_answer, max_results
            )

            # Generate related questions (prioritize timestamp search results)
            if timestamp_results:
                # Use chunks that hit in timestamp search for related question generation
                timestamp_context_chunks = []
                for result in timestamp_results:
                    timestamp_context_chunks.append(
                        {
                            "text": result["text"],
                            "video_id": result["video_id"],
                            "video_title": result["video_title"],
                            "start_time": result["timestamp"],
                            "end_time": result["end_time"],  # Use actual end_time
                        }
                    )
                related_questions = self.generate_related_questions(
                    group, timestamp_context_chunks, max_questions=3
                )
            else:
                # If no timestamp search results, use RAG context as usual
                related_questions = self.generate_related_questions(
                    group, context_chunks, max_questions=3
                )

            yield {
                "type": "complete",
                "full_answer": full_answer,
                "timestamp_results": timestamp_results,
                "related_questions": related_questions,
                "query": query,
                "group_name": group.name,
            }

        except Exception as e:
            yield {
                "type": "error",
                "message": f"Error occurred while generating answer: {str(e)}",
            }
