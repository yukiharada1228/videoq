from __future__ import annotations

import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, cast

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


def _deep_merge(base: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
    merged = deepcopy(base)
    for key, value in overrides.items():
        if key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _resolve_locale_config(locale: Optional[str]) -> Dict[str, Any]:
    config_root = _load_prompt_config().get(PROMPTS_ROOT_KEY, {})
    default_config = config_root.get(DEFAULT_LOCALE)

    if not isinstance(default_config, dict):
        raise PromptConfigurationError(
            f"Prompt configuration missing '{DEFAULT_LOCALE}' locale for key '{PROMPTS_ROOT_KEY}'."
        )

    resolved = deepcopy(default_config)

    if locale:
        for candidate in _iter_locale_candidates(locale):
            if candidate == DEFAULT_LOCALE:
                continue
            locale_config = config_root.get(candidate)
            if isinstance(locale_config, dict):
                resolved = _deep_merge(resolved, locale_config)
                break

    return resolved


def build_system_prompt(
    locale: Optional[str] = None, references: Optional[Sequence[str]] = None
) -> str:
    """詳細プロンプトテンプレートに基づきシステムメッセージを構築する。"""
    config = _resolve_locale_config(locale)

    header_template = config.get("header")
    role = config.get("role")
    background = config.get("background")
    request = config.get("request")
    format_instruction = config.get("format_instruction")
    rules = config.get("rules", [])
    section_titles = config.get("section_titles", {})
    reference_config = config.get("reference", {})

    fields = [header_template, role, background, request, format_instruction]
    if not all(isinstance(field, str) and field.strip() for field in fields):
        raise PromptConfigurationError(
            "Prompt configuration lacks required header fields."
        )

    if not isinstance(rules, list) or any(not isinstance(rule, str) for rule in rules):
        raise PromptConfigurationError("Prompt rules must be a list of strings.")

    rules_label = section_titles.get("rules", "# Rules")
    format_label = section_titles.get("format", "# Format")
    reference_label = section_titles.get("reference", "# Reference Materials")

    header_template_str = cast(str, header_template)
    role_str = cast(str, role)
    background_str = cast(str, background)
    request_str = cast(str, request)
    format_instruction_str = cast(str, format_instruction)

    header = header_template_str.format(
        role=role_str,
        background=background_str,
        request=request_str,
        format_instruction=format_instruction_str,
        rules_label=rules_label,
        format_label=format_label,
        reference_label=reference_label,
    )

    lines: List[str] = [header.strip(), "", rules_label]

    if rules:
        for idx, rule in enumerate(rules, start=1):
            lines.append(f"{idx}. {rule}")
    else:
        lines.append("1. Follow common-sense safety best practices.")

    lines.extend(
        [
            "",
            format_label,
            format_instruction_str.strip(),
            "",
            reference_label,
        ]
    )

    reference_lead = reference_config.get("lead", "")
    reference_footer = reference_config.get("footer", "")
    reference_empty = reference_config.get("empty", "")

    reference_texts = [str(ref) for ref in (references or []) if str(ref).strip()]

    if reference_texts:
        if reference_lead:
            lines.append(reference_lead)
        lines.extend(reference_texts)
        if reference_footer:
            lines.append(reference_footer)
    elif reference_empty:
        lines.append(reference_empty)

    return "\n".join(lines)
