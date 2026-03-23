"""Helpers for repairing inline scene reference markup."""

from __future__ import annotations

import re

_COMPLETE_REF_TAG_RE = re.compile(r'<ref\s+ids="([^"]+)">([\s\S]*?)</ref>')
_OPEN_REF_TAG_RE = re.compile(r'<ref\s+ids="([^"]+)">')
_ANY_OPEN_REF_TAG_RE = re.compile(r"<ref(?:\s+[^>]*)?>")
_CLOSE_REF_TAG_RE = re.compile(r"</ref>")


def repair_ref_markup(content: str) -> str:
    """Ensure dangling ref tags are converted into valid ref pairs."""
    if not content or "<ref" not in content:
        return content

    protected: list[str] = []

    def _protect(match: re.Match[str]) -> str:
        token = f"__VIDEOQ_REF_{len(protected)}__"
        protected.append(match.group(0))
        return token

    repaired = _COMPLETE_REF_TAG_RE.sub(_protect, content)
    repaired = _OPEN_REF_TAG_RE.sub(
        lambda match: f'<ref ids="{match.group(1)}"> </ref>',
        repaired,
    )
    repaired = _ANY_OPEN_REF_TAG_RE.sub("", repaired)
    repaired = _CLOSE_REF_TAG_RE.sub("", repaired)

    for index, markup in enumerate(protected):
        repaired = repaired.replace(f"__VIDEOQ_REF_{index}__", markup)

    return repaired
