"""Shared OpenRouter connection; explicit endpoint and purpose keys remain supported."""
from urllib.parse import urlsplit

from worker_python.env import env_str
from .openrouter_federation import openrouter_token

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def is_openrouter(base_url: str) -> bool:
    return urlsplit(base_url).hostname == "openrouter.ai"


def shared_base_url() -> str:
    default = OPENROUTER_BASE_URL if (env_str("OPENROUTER_API_KEY") or env_str("OPENROUTER_FEDERATION_POLICY_ID")) else "https://api.openai.com/v1"
    return (env_str("OPENAI_BASE_URL") or default).rstrip("/")


def shared_api_key(base_url: str) -> str:
    if is_openrouter(base_url) and env_str("OPENROUTER_FEDERATION_POLICY_ID"):
        return openrouter_token()
    return env_str("OPENROUTER_API_KEY") if is_openrouter(base_url) else env_str("OPENAI_API_KEY")

