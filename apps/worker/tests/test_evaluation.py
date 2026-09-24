"""Tests for RAGAS evaluation pipeline."""

from __future__ import annotations

import asyncio
import builtins
import sys
from contextlib import nullcontext
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.error import HTTPError

import pytest

from worker_python.pipeline import embeddings, evaluation
from worker_python.tasks import evaluation as evaluation_task


def test_score_chat_log_raises_when_ragas_missing():
    real_import = builtins.__import__

    def blocked(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: A002
        if name == "ragas" or name.startswith("ragas."):
            raise ImportError("No module named ragas")
        return real_import(name, globals, locals, fromlist, level)

    with patch("builtins.__import__", side_effect=blocked):
        with pytest.raises(RuntimeError, match="RAGAS dependencies could not be imported") as caught:
            evaluation.score_chat_log("q", "a", ["ctx"])
    assert isinstance(caught.value.__cause__, ImportError)
    assert "pyproject.toml" in str(caught.value)


def test_score_chat_log_runs_three_metrics_with_contexts(monkeypatch):
    sample_cls = MagicMock(name="SingleTurnSample")
    faith = MagicMock(name="FaithfulnessInstance")
    relevancy = MagicMock(name="RelevancyInstance")
    precision = MagicMock(name="PrecisionInstance")

    modules = {
        "ragas": MagicMock(),
        "ragas.dataset_schema": MagicMock(SingleTurnSample=sample_cls),
        "ragas.embeddings": MagicMock(
            LangchainEmbeddingsWrapper=MagicMock(side_effect=lambda x: ("emb", x))
        ),
        "ragas.llms": MagicMock(
            LangchainLLMWrapper=MagicMock(side_effect=lambda x: ("llm", x))
        ),
        "ragas.metrics": MagicMock(
            Faithfulness=MagicMock(return_value=faith),
            ResponseRelevancy=MagicMock(return_value=relevancy),
            LLMContextPrecisionWithoutReference=MagicMock(return_value=precision),
        ),
    }

    for name, module in modules.items():
        monkeypatch.setitem(sys.modules, name, module)
    with (
        patch.object(evaluation, "_langchain_llm", return_value=MagicMock(name="llm")),
        patch.object(
            evaluation, "_langchain_embeddings", return_value=MagicMock(name="emb")
        ),
        patch.object(
            evaluation, "_run_metric", side_effect=[0.91, 0.82, 0.73]
        ) as run_metric,
    ):
        scores = evaluation.score_chat_log("question", "answer", ["ctx-a", "ctx-b"])

    assert scores == (0.91, 0.82, 0.73)
    sample_cls.assert_called_once_with(
        user_input="question",
        response="answer",
        retrieved_contexts=["ctx-a", "ctx-b"],
    )
    assert run_metric.call_args_list[0].args[0] is faith
    assert run_metric.call_args_list[1].args[0] is relevancy
    assert run_metric.call_args_list[2].args[0] is precision


def test_score_chat_log_skips_precision_without_contexts(monkeypatch):
    modules = {
        "ragas": MagicMock(),
        "ragas.dataset_schema": MagicMock(
            SingleTurnSample=MagicMock(return_value=MagicMock())
        ),
        "ragas.embeddings": MagicMock(
            LangchainEmbeddingsWrapper=MagicMock(side_effect=lambda x: x)
        ),
        "ragas.llms": MagicMock(
            LangchainLLMWrapper=MagicMock(side_effect=lambda x: x)
        ),
        "ragas.metrics": MagicMock(
            Faithfulness=MagicMock(return_value=MagicMock()),
            ResponseRelevancy=MagicMock(return_value=MagicMock()),
            LLMContextPrecisionWithoutReference=MagicMock(return_value=MagicMock()),
        ),
    }

    for name, module in modules.items():
        monkeypatch.setitem(sys.modules, name, module)
    with (
        patch.object(evaluation, "_langchain_llm", return_value=MagicMock()),
        patch.object(evaluation, "_langchain_embeddings", return_value=MagicMock()),
        patch.object(evaluation, "_run_metric", side_effect=[0.5, 0.6]) as run_metric,
    ):
        scores = evaluation.score_chat_log("q", "a", [])

    assert scores == (0.5, 0.6, None)
    assert run_metric.call_count == 2


@pytest.mark.parametrize("score", [0.0, 0.42, 1.0, -0.25])
def test_run_metric_returns_float_on_success(score):
    metric = MagicMock()
    metric.single_turn_ascore = AsyncMock(return_value=score)
    assert asyncio.run(evaluation._run_metric(metric, MagicMock())) == score


@pytest.mark.parametrize("score", [None, float("nan"), float("inf"), float("-inf")])
def test_run_metric_treats_unavailable_scores_as_missing(score):
    metric = MagicMock()
    metric.single_turn_ascore = AsyncMock(return_value=score)
    assert asyncio.run(evaluation._run_metric(metric, MagicMock())) is None


def test_run_metric_returns_none_on_failure():
    metric = MagicMock()
    metric.__class__.__name__ = "Faithfulness"
    metric.single_turn_ascore = AsyncMock(side_effect=RuntimeError("boom"))
    assert asyncio.run(evaluation._run_metric(metric, MagicMock())) is None


def test_rejected_embedding_marks_evaluation_failed(monkeypatch, caplog):
    monkeypatch.setenv("EMBEDDING_PROVIDER", "ollama")
    monkeypatch.setenv("EMBEDDING_MODEL", "qwen3-embedding:4b")
    private_body = "private provider response"
    http = MagicMock(side_effect=HTTPError(
        "http://example.invalid/api/embed", 400, private_body, {}, BytesIO(private_body.encode()),
    ))
    monkeypatch.setattr(embeddings.urllib.request, "urlopen", http)

    class RelevancyMetric:
        def __init__(self, *, llm, embeddings):
            self.embeddings = embeddings

        async def single_turn_ascore(self, sample):
            await self.embeddings.aembed_query("synthetic question")
            return 1.0

    # Stub third-party LLM scoring; exercise the real task, common adapter,
    # provider error classification and _run_metric propagation together.
    modules = {
        "ragas": MagicMock(),
        "ragas.dataset_schema": MagicMock(),
        "ragas.embeddings": MagicMock(LangchainEmbeddingsWrapper=lambda value: value),
        "ragas.llms": MagicMock(LangchainLLMWrapper=lambda value: value),
        "ragas.metrics": MagicMock(
            Faithfulness=MagicMock(return_value=MagicMock(single_turn_ascore=AsyncMock(return_value=1.0))),
            ResponseRelevancy=RelevancyMetric,
        ),
    }
    monkeypatch.setattr(evaluation, "_langchain_llm", MagicMock())
    monkeypatch.setattr(evaluation_task, "db_connection", lambda: nullcontext(MagicMock()))
    monkeypatch.setattr(evaluation_task, "_fetch_chat_log", lambda *_: {
        "question": "question", "answer": "answer", "retrieved_contexts": [],
    })
    save = MagicMock()
    monkeypatch.setattr(evaluation_task, "_save_evaluation", save)
    for name, module in modules.items():
        monkeypatch.setitem(sys.modules, name, module)
    evaluation_task.evaluate_chat_log(42)

    http.assert_called_once()
    save.assert_called_once()
    result = save.call_args.kwargs
    assert result["status"] == "failed"
    assert result["evaluated_at"] is None
    assert result["answer_relevancy"] is None
    assert "HTTP 400" in result["error_message"]
    assert private_body not in result["error_message"]
    assert private_body not in caplog.text
