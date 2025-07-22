import os
from typing import Union
from app.opensearch_service import OpenSearchService
from app.pinecone_service import PineconeService


class VectorSearchFactory:
    """環境変数に基づいてベクトル検索サービスを生成するファクトリクラス"""

    @staticmethod
    def create_search_service(
        openai_api_key: str | None = None, user_id: int | None = None, **kwargs
    ) -> Union[OpenSearchService, PineconeService]:
        """
        環境変数VECTOR_SEARCH_PROVIDERに基づいて適切な検索サービスを返す

        Args:
            openai_api_key: OpenAI APIキー
            user_id: ユーザーID
            **kwargs: その他の引数

        Returns:
            OpenSearchService または PineconeService

        Raises:
            ValueError: 無効なプロバイダーが指定された場合
        """
        provider = os.getenv("VECTOR_SEARCH_PROVIDER", "opensearch").lower()

        if provider == "opensearch":
            return OpenSearchService(
                openai_api_key=openai_api_key, user_id=user_id, **kwargs
            )
        elif provider == "pinecone":
            return PineconeService(
                openai_api_key=openai_api_key, user_id=user_id, **kwargs
            )
        else:
            raise ValueError(
                f"Invalid VECTOR_SEARCH_PROVIDER: {provider}. "
                "Must be 'opensearch' or 'pinecone'"
            )

    @staticmethod
    def get_provider_name() -> str:
        """現在設定されているプロバイダー名を返す"""
        return os.getenv("VECTOR_SEARCH_PROVIDER", "opensearch").lower()

    @staticmethod
    def is_pinecone_enabled() -> bool:
        """Pineconeが有効かどうかを返す"""
        return VectorSearchFactory.get_provider_name() == "pinecone"

    @staticmethod
    def is_opensearch_enabled() -> bool:
        """OpenSearchが有効かどうかを返す"""
        return VectorSearchFactory.get_provider_name() == "opensearch"
