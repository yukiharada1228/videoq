"""Parallel verification must preserve upstream RAGAS scores and cleanup."""

import asyncio

import pytest
from ragas.metrics import LLMContextPrecisionWithoutReference
from ragas.metrics._context_precision import ContextPrecisionPrompt, Verification

from worker_python.pipeline.context_precision import (
    MAX_CONCURRENT_CONTEXTS,
    ParallelContextPrecision,
)
from worker_python.pipeline.evaluation import _context_precision_metric


@pytest.mark.parametrize("verdicts", [
    [0, 1, 0, 1, 1],
    [0] * 7,
    [1] * 7,
    [int(i % 3 == 1) for i in range(52)],
])
def test_parallel_precision_matches_ragas_with_out_of_order_results(monkeypatch, verdicts):
    active = peak = 0
    completed = []
    llm = object()
    callbacks = object()
    row = {
        "user_input": "question",
        "response": "answer",
        "retrieved_contexts": [str(i) for i in range(len(verdicts))],
    }

    async def generate(self, *, data, llm, callbacks):
        nonlocal active, peak
        assert data.question == "question"
        assert data.answer == "answer"
        index = int(data.context)
        active += 1
        peak = max(peak, active)
        try:
            # Reverse completion order within each concurrent group.
            await asyncio.sleep((4 - index % 4) * 0.002)
            completed.append(index)
            return [Verification(reason="test", verdict=verdicts[index])]
        finally:
            active -= 1

    monkeypatch.setattr(ContextPrecisionPrompt, "generate_multiple", generate)
    expected = asyncio.run(LLMContextPrecisionWithoutReference(llm=llm)._ascore(row, callbacks))
    completed.clear()
    peak = 0
    metric = _context_precision_metric(llm)
    assert isinstance(metric, ParallelContextPrecision)
    actual = asyncio.run(metric._ascore(row, callbacks))

    assert actual == expected
    assert peak == MAX_CONCURRENT_CONTEXTS
    assert active == 0
    assert sorted(completed) == list(range(len(verdicts)))
    assert completed != sorted(completed)


@pytest.mark.parametrize("cancel", [False, True])
def test_precision_cancels_and_awaits_pending_requests(monkeypatch, cancel):
    async def run():
        active = 0
        started = asyncio.Event()
        never = asyncio.Event()

        async def generate(self, *, data, llm, callbacks):
            nonlocal active
            active += 1
            if active == MAX_CONCURRENT_CONTEXTS:
                started.set()
            try:
                await started.wait()
                if not cancel and data.context == "0":
                    raise RuntimeError("provider unavailable")
                await never.wait()
            finally:
                active -= 1

        monkeypatch.setattr(ContextPrecisionPrompt, "generate_multiple", generate)
        metric = ParallelContextPrecision(llm=object())
        task = asyncio.create_task(metric._ascore({
            "user_input": "question",
            "response": "answer",
            "retrieved_contexts": [str(i) for i in range(52)],
        }, []))
        await asyncio.wait_for(started.wait(), timeout=1)
        if cancel:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        else:
            with pytest.raises(RuntimeError, match="provider unavailable"):
                await task
        assert active == 0
        assert not [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]

    asyncio.run(run())
