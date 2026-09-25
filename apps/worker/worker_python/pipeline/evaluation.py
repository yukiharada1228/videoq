"""RAGAS evaluation via vibrantlabsai/ragas."""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Any

from openai import DefaultAsyncHttpxClient, DefaultHttpxClient

from .embedding_contract import EmbeddingContractError
from worker_python.env import env_str

logger = logging.getLogger(__name__)


def score_chat_log(
    question: str,
    answer: str,
    contexts: list[Any],
) -> tuple[float | None, float | None, float | None]:
    """
    Return (faithfulness, answer_relevancy, context_precision).

    Reference-free metrics used by VideoQ:
    - Faithfulness
    - ResponseRelevancy (answer_relevancy)
    - LLMContextPrecisionWithoutReference (context_precision; skipped if no contexts)
    """
    try:
        from ragas.dataset_schema import SingleTurnSample
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from ragas.llms import LangchainLLMWrapper
        from ragas.metrics import (
            Faithfulness,
            ResponseRelevancy,
        )
    except ImportError as exc:
        raise RuntimeError(
            "RAGAS dependencies could not be imported. "
            "Install the worker dependencies from pyproject.toml."
        ) from exc

    retrieved = [str(c) for c in (contexts or []) if c is not None]
    sample = SingleTurnSample(
        user_input=question,
        response=answer,
        retrieved_contexts=retrieved or [""],
    )

    async def score_metrics():
        # LangChain's default HTTP pool is cached across model instances. Own
        # both clients so connections never outlive this job's event loop.
        with DefaultHttpxClient() as http_client:
            async with DefaultAsyncHttpxClient() as http_async_client:
                wrapped_llm = LangchainLLMWrapper(
                    _langchain_llm(
                        http_client=http_client, http_async_client=http_async_client
                    )
                )
                wrapped_embeddings = LangchainEmbeddingsWrapper(_langchain_embeddings())
                faithfulness = await _run_metric(Faithfulness(llm=wrapped_llm), sample)
                answer_relevancy = await _run_metric(
                    ResponseRelevancy(llm=wrapped_llm, embeddings=wrapped_embeddings),
                    sample,
                )
                context_precision = (
                    await _run_metric(
                        _context_precision_metric(wrapped_llm), sample
                    )
                    if retrieved
                    else None
                )
                return faithfulness, answer_relevancy, context_precision

    return asyncio.run(score_metrics())


def _context_precision_metric(llm):
    from .context_precision import ParallelContextPrecision

    return ParallelContextPrecision(llm=llm)


def _langchain_llm(*, http_client, http_async_client):
    from langchain_openai import ChatOpenAI
    from pydantic import SecretStr

    api_key = env_str("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for RAGAS evaluation.")
    model = env_str("LLM_MODEL", "gpt-4o-mini")
    try:
        max_tokens = int(env_str("RAGAS_MAX_TOKENS", "4096"))
    except ValueError as exc:
        raise ValueError("RAGAS_MAX_TOKENS must be a positive integer.") from exc
    if max_tokens <= 0:
        raise ValueError("RAGAS_MAX_TOKENS must be a positive integer.")
    # Faithfulness expands answers into structured statements and verdicts.
    # A 1,024-token budget can truncate these intermediate evaluation outputs.
    return ChatOpenAI(
        model=model,
        api_key=SecretStr(api_key),
        temperature=0.0,
        max_tokens=max_tokens,
        http_client=http_client,
        http_async_client=http_async_client,
    )


def _langchain_embeddings():
    from .embedding_contract import resolve_embedding_config
    from .langchain_embeddings import VideoQEmbeddings

    resolve_embedding_config()
    return VideoQEmbeddings()


async def _run_metric(metric: Any, sample: Any) -> float | None:
    try:
        score = await metric.single_turn_ascore(sample)
        if score is None:
            return None
        value = float(score)
        # RAGAS can return NaN when it cannot score an answer. Keep it missing
        # so one unavailable metric cannot poison PostgreSQL averages or JSON.
        return value if math.isfinite(value) else None
    except EmbeddingContractError:
        raise
    except Exception as exc:  # noqa: BLE001 - isolate third-party metric failures
        logger.warning("Metric %s failed: %s", metric.__class__.__name__, exc)
        return None
