"""RAGAS evaluation via vibrantlabsai/ragas."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

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
        _ensure_ragas_importable()
        from ragas.dataset_schema import SingleTurnSample
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from ragas.llms import LangchainLLMWrapper
        from ragas.metrics import (
            Faithfulness,
            LLMContextPrecisionWithoutReference,
            ResponseRelevancy,
        )
    except ImportError as exc:
        raise RuntimeError(
            "ragas is not installed. Add it to requirements.txt."
        ) from exc

    retrieved = [str(c) for c in (contexts or []) if c is not None]
    sample = SingleTurnSample(
        user_input=question,
        response=answer,
        retrieved_contexts=retrieved or [""],
    )

    wrapped_llm = LangchainLLMWrapper(_langchain_llm())
    wrapped_embeddings = LangchainEmbeddingsWrapper(_langchain_embeddings())

    faithfulness = _run_metric(Faithfulness(llm=wrapped_llm), sample)
    answer_relevancy = _run_metric(
        ResponseRelevancy(llm=wrapped_llm, embeddings=wrapped_embeddings),
        sample,
    )
    context_precision: float | None = None
    if retrieved:
        context_precision = _run_metric(
            LLMContextPrecisionWithoutReference(llm=wrapped_llm),
            sample,
        )

    return faithfulness, answer_relevancy, context_precision


def _ensure_ragas_importable() -> None:
    """
    ragas 0.4.3 unconditionally imports ChatVertexAI from a path removed in
    langchain-community>=0.4.2. Stub the symbol when the real module is absent
    so OpenAI/Ollama evaluation still works (we never use Vertex).
    """
    import sys
    import types

    name = "langchain_community.chat_models.vertexai"
    if name in sys.modules:
        return
    try:
        __import__(name)
    except ImportError:
        mod = types.ModuleType(name)

        class ChatVertexAI:  # noqa: N801 - match upstream symbol name
            pass

        mod.ChatVertexAI = ChatVertexAI
        sys.modules[name] = mod


def _langchain_llm():
    from langchain_openai import ChatOpenAI
    from pydantic import SecretStr

    api_key = env_str("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for RAGAS evaluation.")
    model = env_str("LLM_MODEL", "gpt-4o-mini")
    llm = ChatOpenAI(model=model, api_key=SecretStr(api_key), temperature=0.0)
    llm.max_tokens = 1024
    return llm


def _langchain_embeddings():
    provider = env_str("EMBEDDING_PROVIDER", "openai").lower()
    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings

        model = env_str("EMBEDDING_MODEL")
        if not model:
            raise RuntimeError(
                "EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=ollama."
            )
        return OllamaEmbeddings(
            model=model,
            base_url=env_str("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        )
    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        from pydantic import SecretStr

        api_key = env_str("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for OpenAI embeddings.")
        kwargs: dict[str, Any] = {
            "model": env_str("EMBEDDING_MODEL", "text-embedding-3-small"),
            "api_key": SecretStr(api_key),
        }
        dims = env_str("EMBEDDING_VECTOR_SIZE")
        if dims.isdigit() and int(dims) > 0:
            kwargs["dimensions"] = int(dims)
        return OpenAIEmbeddings(**kwargs)
    raise RuntimeError(f"Unsupported EMBEDDING_PROVIDER={provider!r}")


def _run_metric(metric: Any, sample: Any) -> float | None:
    try:
        score = asyncio.run(metric.single_turn_ascore(sample))
        return float(score) if score is not None else None
    except Exception as exc:  # noqa: BLE001 - isolate third-party metric failures
        logger.warning("Metric %s failed: %s", metric.__class__.__name__, exc)
        return None
