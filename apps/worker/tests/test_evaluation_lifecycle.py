"""Evaluation must own its HTTP clients and reuse one loop per chat log."""

import asyncio
import sys
from unittest.mock import MagicMock

import httpx
import pytest

from worker_python.pipeline import evaluation
from worker_python.pipeline.embedding_contract import EmbeddingContractError


@pytest.mark.parametrize("failure", [None, "metric", "contract"])
def test_evaluation_reuses_one_loop_and_closes_clients_between_jobs(
    monkeypatch, failure
):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://evaluation.invalid/v1")
    clients = []
    loops = {}
    original_llm = evaluation._langchain_llm

    def create_llm(**kwargs):
        llm = original_llm(**kwargs)
        clients.append(llm)
        return llm

    async def send(client, request, **kwargs):
        # Model a keep-alive connection bound to its first event loop, without
        # making network requests. Exercise the real LangChain/OpenAI clients.
        loop = asyncio.get_running_loop()
        assert loops.setdefault(client, loop) is loop
        return httpx.Response(
            200,
            request=request,
            json={
                "id": "test-completion",
                "model": "gpt-4o-mini",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "0.5"},
                    }
                ],
            },
        )

    class Metric:
        def __init__(self, *, llm, embeddings=None):
            self.llm = llm
            self.relevancy = embeddings is not None

        async def single_turn_ascore(self, sample):
            result = await self.llm.ainvoke("Score this answer")
            if self.relevancy and failure == "contract":
                raise EmbeddingContractError("EMBEDDING_CONFIG_INVALID", "bad config")
            if self.relevancy and failure == "metric":
                raise RuntimeError("Metric unavailable")
            return float(result.content)

    modules = {
        "ragas": MagicMock(),
        "ragas.dataset_schema": MagicMock(),
        "ragas.llms": MagicMock(LangchainLLMWrapper=lambda value: value),
        "ragas.embeddings": MagicMock(LangchainEmbeddingsWrapper=lambda value: value),
        "ragas.metrics": MagicMock(
            Faithfulness=Metric,
            ResponseRelevancy=Metric,
            LLMContextPrecisionWithoutReference=Metric,
        ),
    }
    # OpenAI SDK versions use different default transports. Inject the clients
    # whose send method is patched so this lifecycle test stays offline.
    monkeypatch.setattr(evaluation, "DefaultHttpxClient", httpx.Client)
    monkeypatch.setattr(evaluation, "DefaultAsyncHttpxClient", httpx.AsyncClient)
    monkeypatch.setattr(httpx.AsyncClient, "send", send)
    monkeypatch.setattr(evaluation, "_langchain_llm", create_llm)
    monkeypatch.setattr(evaluation, "_langchain_embeddings", MagicMock())
    # Restore only the stubbed modules; restoring all of sys.modules removes
    # lazily imported LangChain modules while Pydantic still caches their types.
    for name, module in modules.items():
        monkeypatch.setitem(sys.modules, name, module)
    for _ in range(2):
        if failure == "contract":
            with pytest.raises(EmbeddingContractError):
                evaluation.score_chat_log("Question", "Answer", ["Context"])
        else:
            assert evaluation.score_chat_log("Question", "Answer", ["Context"]) == (
                0.5,
                None if failure == "metric" else 0.5,
                0.5,
            )
        assert clients[-1].root_client.is_closed()
        assert clients[-1].root_async_client.is_closed()
    assert len(loops) == 2  # No loop-bound HTTP pool survives into the next job.
    assert len(set(loops.values())) == 2
