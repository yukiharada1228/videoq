"""Application-level exceptions for the chat use-case context."""


class LLMConfigurationError(Exception):
    """Raised when the LLM cannot be configured (missing/invalid API key, unknown provider)."""


class LLMProviderError(Exception):
    """Raised when the LLM provider returns an error during generation."""
