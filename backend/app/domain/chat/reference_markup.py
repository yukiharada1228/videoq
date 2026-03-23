"""Helpers for repairing inline scene reference markup."""

from __future__ import annotations

import re

_COMPLETE_REF_TAG_RE = re.compile(r'<ref\s+ids="([^"]+)">([\s\S]*?)</ref>')
_OPEN_REF_TAG_RE = re.compile(r'<ref\s+ids="([^"]+)">')
_INVALID_OPEN_REF_TAG_RE = re.compile(r'<ref(?!\s+ids="[^"]+">)(?:\s+[^>]*)?>')
_CLOSE_REF_TAG_RE = re.compile(r"</ref>")


def repair_ref_markup(content: str) -> str:
    """Ensure dangling ref tags are converted into valid ref pairs."""
    if not content or "<ref" not in content:
        return content

    protected: list[str] = []
    repaired_refs: list[str] = []

    def _protect(match: re.Match[str]) -> str:
        token = f"__VIDEOQ_REF_{len(protected)}__"
        protected.append(match.group(0))
        return token

    def _repair_dangling_open(match: re.Match[str]) -> str:
        token = f"__VIDEOQ_REPAIRED_REF_{len(repaired_refs)}__"
        repaired_refs.append(f'<ref ids="{match.group(1)}"> </ref>')
        return token

    repaired = _COMPLETE_REF_TAG_RE.sub(_protect, content)
    repaired = _OPEN_REF_TAG_RE.sub(_repair_dangling_open, repaired)
    repaired = _INVALID_OPEN_REF_TAG_RE.sub("", repaired)
    repaired = _CLOSE_REF_TAG_RE.sub("", repaired)

    for index, markup in enumerate(protected):
        repaired = repaired.replace(f"__VIDEOQ_REF_{index}__", markup)
    for index, markup in enumerate(repaired_refs):
        repaired = repaired.replace(f"__VIDEOQ_REPAIRED_REF_{index}__", markup)

    return repaired
