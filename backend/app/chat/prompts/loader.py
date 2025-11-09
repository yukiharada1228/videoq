from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

DEFAULT_LOCALE = "default"
PROMPTS_ROOT_KEY = "rag"
PROMPTS_PATH = Path(__file__).with_name("prompts.json")


class PromptConfigurationError(RuntimeError):
    """プロンプト設定に問題がある場合の例外."""


@lru_cache(maxsize=1)
def _load_prompt_config() -> Dict[str, Any]:
    if not PROMPTS_PATH.exists():
        raise PromptConfigurationError(
            f"Prompt configuration file not found: {PROMPTS_PATH}"
        )

    with PROMPTS_PATH.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def _iter_locale_candidates(locale: Optional[str]) -> Iterable[str]:
    if locale:
        yield locale
        if "-" in locale:
            yield locale.split("-", 1)[0]
    yield DEFAULT_LOCALE


def _get_locale_config(locale: Optional[str]) -> Dict[str, Any]:
    config = _load_prompt_config().get(PROMPTS_ROOT_KEY, {})

    for candidate in _iter_locale_candidates(locale):
        locale_config = config.get(candidate)
        if locale_config:
            return locale_config

    raise PromptConfigurationError(
        f"Prompt configuration missing '{DEFAULT_LOCALE}' locale for key '{PROMPTS_ROOT_KEY}'."
    )


def get_system_prompt(locale: Optional[str] = None) -> str:
    """ドキュメントが無い場合に利用するシステムプロンプトを取得."""
    locale_config = _get_locale_config(locale)
    prompt = locale_config.get("system_prompt")
    if prompt:
        return prompt

    default_prompt = _get_locale_config(DEFAULT_LOCALE).get("system_prompt")
    if default_prompt:
        return default_prompt

    raise PromptConfigurationError("System prompt is not configured.")


def get_system_context_parts(locale: Optional[str] = None) -> Dict[str, str]:
    """ドキュメントが存在する場合に利用するコンテキスト用の定型文を取得."""
    locale_config = _get_locale_config(locale)
    context_parts = locale_config.get("system_context")
    if context_parts:
        return {
            "lead": context_parts.get("lead", ""),
            "footer": context_parts.get("footer", ""),
        }

    default_context = _get_locale_config(DEFAULT_LOCALE).get("system_context", {})
    if default_context:
        return {
            "lead": default_context.get("lead", ""),
            "footer": default_context.get("footer", ""),
        }

    return {"lead": "", "footer": ""}
