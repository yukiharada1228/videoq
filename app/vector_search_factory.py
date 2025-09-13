import os
from typing import Union

from app.opensearch_service import OpenSearchService
from app.pinecone_service import PineconeService


class VectorSearchFactory:
    """Factory class to generate vector search service based on environment variables"""

    @staticmethod
    def create_search_service(
        user_id: int, openai_api_key: str | None = None, **kwargs
    ) -> Union[OpenSearchService, PineconeService]:
        """
        Return appropriate search service based on VECTOR_SEARCH_PROVIDER environment variable

        Args:
            openai_api_key: OpenAI API key
            user_id: User ID
            **kwargs: Other arguments

        Returns:
            OpenSearchService or PineconeService

        Raises:
            ValueError: When invalid provider is specified
        """
        provider = os.getenv("VECTOR_SEARCH_PROVIDER", "opensearch").lower()

        if provider == "opensearch":
            return OpenSearchService(
                user_id=user_id, openai_api_key=openai_api_key, **kwargs
            )
        elif provider == "pinecone":
            return PineconeService(
                user_id=user_id, openai_api_key=openai_api_key, **kwargs
            )
        else:
            raise ValueError(
                f"Invalid VECTOR_SEARCH_PROVIDER: {provider}. "
                "Must be 'opensearch' or 'pinecone'"
            )

    @staticmethod
    def get_provider_name() -> str:
        """Return currently configured provider name"""
        return os.getenv("VECTOR_SEARCH_PROVIDER", "opensearch").lower()

    @staticmethod
    def is_pinecone_enabled() -> bool:
        """Return whether Pinecone is enabled"""
        return VectorSearchFactory.get_provider_name() == "pinecone"

    @staticmethod
    def is_opensearch_enabled() -> bool:
        """Return whether OpenSearch is enabled"""
        return VectorSearchFactory.get_provider_name() == "opensearch"
