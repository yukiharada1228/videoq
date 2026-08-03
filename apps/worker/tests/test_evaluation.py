"""Tests for RAGAS evaluation pipeline."""

from __future__ import annotations

import builtins
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from worker_python.pipeline import evaluation


def test_score_chat_log_raises_when_ragas_missing():
    real_import = builtins.__import__

    def blocked(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: A002
        if name == "ragas" or name.startswith("ragas."):
            raise ImportError("No module named ragas")
        return real_import(name, globals, locals, fromlist, level)

    with patch("builtins.__import__", side_effect=blocked):
        with pytest.raises(RuntimeError, match="ragas is not installed"):
            evaluation.score_chat_log("q", "a", ["ctx"])


def test_score_chat_log_runs_three_metrics_with_contexts():
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

    with (
        patch.dict("sys.modules", modules),
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


def test_score_chat_log_skips_precision_without_contexts():
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

    with (
        patch.dict("sys.modules", modules),
        patch.object(evaluation, "_langchain_llm", return_value=MagicMock()),
        patch.object(evaluation, "_langchain_embeddings", return_value=MagicMock()),
        patch.object(evaluation, "_run_metric", side_effect=[0.5, 0.6]) as run_metric,
    ):
        scores = evaluation.score_chat_log("q", "a", [])

    assert scores == (0.5, 0.6, None)
    assert run_metric.call_count == 2


def test_run_metric_returns_float_on_success():
    metric = MagicMock()
    metric.single_turn_ascore = AsyncMock(return_value=0.42)
    assert evaluation._run_metric(metric, MagicMock()) == 0.42


def test_run_metric_returns_none_on_failure():
    metric = MagicMock()
    metric.__class__.__name__ = "Faithfulness"
    metric.single_turn_ascore = AsyncMock(side_effect=RuntimeError("boom"))
    assert evaluation._run_metric(metric, MagicMock()) is None
