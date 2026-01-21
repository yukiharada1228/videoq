"""
Application configuration using dataclasses
"""

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AppConfig:
    """
    Application configuration object.
    Supports loading from environment variables and customization for testing.
    """

    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/postgres"
        )
    )
    openai_api_key: Optional[str] = field(
        default_factory=lambda: os.getenv("OPENAI_API_KEY")
    )
    embedding_provider: str = field(
        default_factory=lambda: os.getenv("EMBEDDING_PROVIDER", "openai")
    )
    pgvector_collection_name: str = field(
        default_factory=lambda: os.getenv("PGVECTOR_COLLECTION_NAME", "videoq_scenes")
    )

    def validate(self):
        """
        Validate configuration for consistency.
        Raises ImproperlyConfigured if configuration is invalid.
        """
        from django.core.exceptions import ImproperlyConfigured

        if self.embedding_provider == "openai" and not self.openai_api_key:
            raise ImproperlyConfigured(
                "OPENAI_API_KEY must be set when EMBEDDING_PROVIDER is 'openai'"
            )

    @classmethod
    def from_env(cls) -> "AppConfig":
        """
        Create configuration from environment variables.

        Returns:
            AppConfig instance with values from environment
        """
        config = cls()
        config.validate()
        return config

    @classmethod
    def for_testing(cls, **overrides) -> "AppConfig":
        """
        Create configuration for testing with optional overrides.

        Args:
            **overrides: Keyword arguments to override default values

        Returns:
            AppConfig instance configured for testing
        """
        defaults = {
            "database_url": "postgresql://test:test@localhost:5432/test",
            "openai_api_key": "test-api-key",
            "embedding_provider": "openai",
            "pgvector_collection_name": "test_collection",
        }
        defaults.update(overrides)
        return cls(**defaults)
