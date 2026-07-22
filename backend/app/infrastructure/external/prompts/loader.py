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
    """Exception raised when there is a problem with prompt configuration."""


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
    return resolve_locale_section(PROMPTS_ROOT_KEY, locale)


def resolve_locale_section(root_key: str, locale: Optional[str] = None) -> Dict[str, Any]:
    """Merge default + locale overrides for any top-level prompts.json section."""
    config_root = _load_prompt_config().get(root_key, {})
    default_config = config_root.get(DEFAULT_LOCALE)

    if not isinstance(default_config, dict):
        raise PromptConfigurationError(
            f"Prompt configuration missing '{DEFAULT_LOCALE}' locale for key '{root_key}'."
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


def detect_transcript_locale(text: str) -> str:
    """Pick prompts.json locale from transcript script (ja vs default/en)."""
    if not text:
        return DEFAULT_LOCALE
    cjk = 0
    for ch in text:
        code = ord(ch)
        if (
            0x3040 <= code <= 0x30FF  # Hiragana / Katakana
            or 0x4E00 <= code <= 0x9FFF  # CJK Unified Ideographs
            or 0xFF66 <= code <= 0xFF9D  # Halfwidth Katakana
        ):
            cjk += 1
    # Sparse subtitles still count as Japanese when CJK density is meaningful.
    if cjk >= 20 or (len(text) > 0 and cjk / len(text) >= 0.03):
        return "ja"
    return DEFAULT_LOCALE


def get_plog_study_config(locale: Optional[str] = None) -> Dict[str, Any]:
    """Locale-aware PLOG study-mode strings (same pattern as RAG prompts)."""
    return resolve_locale_section("plog_study", locale)


def get_qa_agent_config(locale: Optional[str] = None) -> Dict[str, Any]:
    """Locale-aware system text for the QA tool-calling evidence loop."""
    return resolve_locale_section("qa_agent", locale)


def build_fallback_learning_object(label: str, locale: Optional[str] = None, *, short: bool = False) -> dict:
    """Build opening_question + hint_ladder for a concept when Stage2 omits them."""
    config = get_plog_study_config(locale)
    opening = str(config.get("opening_question") or "What do you already know about {label}?").format(
        label=label
    )
    key = "hint_ladder_short" if short else "hint_ladder"
    raw_hints = config.get(key) or config.get("hint_ladder") or []
    hints = [str(h).format(label=label) for h in raw_hints if h]
    return {"opening_question": opening, "hint_ladder": hints}


def _is_default_english_fallback_opening(label: str, opening: str) -> bool:
    """True only for the known English template artifact (not arbitrary English text)."""
    text = (opening or "").strip()
    if not text:
        return True
    en = build_fallback_learning_object(label, DEFAULT_LOCALE)["opening_question"]
    return text == en


def resolve_opening_question(
    label: str, opening: Optional[str], locale: Optional[str] = None
) -> str:
    """Return opening text, replacing empty / known English fallback templates only."""
    preferred = build_fallback_learning_object(label, locale)["opening_question"]
    text = (opening or "").strip()
    if _is_default_english_fallback_opening(label, text):
        return preferred
    return text


def normalize_learning_object_for_locale(
    label: str,
    *,
    opening_question: str,
    hint_ladder: Sequence[str],
    locale: Optional[str] = None,
) -> dict:
    """At build time: align LO strings to the lecture locale.

    Replaces empty values and the known English fallback templates when the
    lecture locale is not English. Does not rewrite arbitrary LLM text by script.
    """
    preferred = build_fallback_learning_object(label, locale)
    en = build_fallback_learning_object(label, DEFAULT_LOCALE)
    opening = (opening_question or "").strip()
    if _is_default_english_fallback_opening(label, opening):
        opening = preferred["opening_question"]

    hints = [str(h) for h in (hint_ladder or []) if str(h).strip()]
    en_hints = en["hint_ladder"]
    en_short = build_fallback_learning_object(label, DEFAULT_LOCALE, short=True)["hint_ladder"]
    if not hints or hints == en_hints or hints == en_short:
        hints = preferred["hint_ladder"]
    return {"opening_question": opening, "hint_ladder": hints}


def _validate_prompt_fields(config: dict) -> tuple:
    """Validate and extract required prompt config fields.

    Returns:
        Tuple of (header, role, background, request, format_instruction, rules, section_titles, reference_config)

    Raises:
        PromptConfigurationError if validation fails.
    """
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

    return (
        cast(str, header_template),
        cast(str, role),
        cast(str, background),
        cast(str, request),
        cast(str, format_instruction),
        rules,
        section_titles,
        reference_config,
    )


def _build_reference_lines(
    reference_config: dict, references: Sequence[str] | None
) -> list[str]:
    """Build the reference section lines."""
    lines: list[str] = []
    lead = reference_config.get("lead", "")
    footer = reference_config.get("footer", "")
    empty = reference_config.get("empty", "")

    texts = [str(ref) for ref in (references or []) if str(ref).strip()]
    if texts:
        if lead:
            lines.append(lead)
        lines.extend(texts)
        if footer:
            lines.append(footer)
    elif empty:
        lines.append(empty)

    return lines


def build_system_prompt(
    locale: Optional[str] = None,
    references: Optional[Sequence[str]] = None,
    group_context: Optional[str] = None,
) -> str:
    """Build system message based on detailed prompt template."""
    config = _resolve_locale_config(locale)

    (
        header_template,
        role,
        background,
        request,
        format_instruction,
        rules,
        section_titles,
        reference_config,
    ) = _validate_prompt_fields(config)

    rules_label = section_titles.get("rules", "# Rules")
    format_label = section_titles.get("format", "# Format")
    reference_label = section_titles.get("reference", "# Reference Materials")
    group_context_label = section_titles.get("group_context", "# Group Context")

    header = header_template.format(
        role=role,
        background=background,
        request=request,
        format_instruction=format_instruction,
        rules_label=rules_label,
        format_label=format_label,
        reference_label=reference_label,
    )

    lines: List[str] = [header.strip()]

    if group_context and group_context.strip():
        lines.extend(["", group_context_label, group_context.strip()])

    lines.extend(["", rules_label])

    if rules:
        for idx, rule in enumerate(rules, start=1):
            lines.append(f"{idx}. {rule}")
    else:
        lines.append("1. Follow common-sense safety best practices.")

    lines.extend(["", format_label, format_instruction.strip(), "", reference_label])
    lines.extend(_build_reference_lines(reference_config, references))

    return "\n".join(lines)
