"""Chat-log evaluation (RAGAS-compatible scores via OpenAI when available)."""

from __future__ import annotations

import json
import logging
from typing import Any

from worker_python.env import env_str, heavy_pipeline_enabled

logger = logging.getLogger(__name__)


def score_chat_log(
    question: str,
    answer: str,
    contexts: list[Any],
) -> tuple[float, float, float]:
    """
    Return (faithfulness, answer_relevancy, context_precision).

    Uses OpenAI JSON scoring when OPENAI_API_KEY is set (or heavy pipeline on);
    otherwise returns deterministic stub scores matching the prior worker stub.
    """
    if not env_str("OPENAI_API_KEY") and not heavy_pipeline_enabled():
        return _stub_scores(question, answer, contexts)

    try:
        return _openai_scores(question, answer, contexts)
    except Exception:
        logger.exception("OpenAI evaluation failed; falling back to stub scores")
        return _stub_scores(question, answer, contexts)


def _stub_scores(
    question: str, answer: str, contexts: list[Any]
) -> tuple[float, float, float]:
    logger.info(
        "RAGAS stub evaluation (question_len=%d, answer_len=%d, contexts=%d)",
        len(question or ""),
        len(answer or ""),
        len(contexts or []),
    )
    return 0.85, 0.80, 0.75


def _openai_scores(
    question: str, answer: str, contexts: list[Any]
) -> tuple[float, float, float]:
    from openai import OpenAI

    client = OpenAI(api_key=env_str("OPENAI_API_KEY"))
    model = env_str("LLM_MODEL", "gpt-4o-mini")
    ctx_text = "\n---\n".join(str(c) for c in (contexts or [])[:8])
    prompt = (
        "You are evaluating a RAG answer. Return ONLY JSON with keys "
        "faithfulness, answer_relevancy, context_precision as floats in [0,1].\n\n"
        f"Question:\n{question}\n\nAnswer:\n{answer}\n\nContexts:\n{ctx_text}\n"
    )
    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    return (
        _clamp01(data.get("faithfulness")),
        _clamp01(data.get("answer_relevancy")),
        _clamp01(data.get("context_precision")),
    )


def _clamp01(value: Any) -> float:
    try:
        x = float(value)
    except (TypeError, ValueError):
        x = 0.0
    return max(0.0, min(1.0, x))
