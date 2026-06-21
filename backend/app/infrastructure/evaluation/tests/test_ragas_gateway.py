"""Tests for :meth:`RagasEvaluationGateway._run_metric` event-loop handling.

The gateway's ``_run_metric`` static method bridges RAGAS's async metric API
into synchronous code. The tricky case is being invoked from *inside* an
already-running event loop: a naive ``asyncio.run`` would raise
``RuntimeError: asyncio.run() cannot be called from a running event loop``.
The implementation guards against this by offloading the coroutine to a worker
thread. These tests exercise that path with a stubbed metric to ensure a float
score is returned without raising.
"""

import asyncio
import unittest
from unittest.mock import MagicMock

from app.infrastructure.evaluation.ragas_gateway import RagasEvaluationGateway


def _make_metric(score: float) -> MagicMock:
    """Build a mock metric whose ``single_turn_ascore`` is an async coroutine.

    Args:
        score: The float value the metric's coroutine resolves to.

    Returns:
        A :class:`~unittest.mock.MagicMock` standing in for a RAGAS metric.
    """

    metric = MagicMock()

    async def _ascore(sample):  # noqa: ANN001 - sample is an opaque stub
        return score

    metric.single_turn_ascore = _ascore
    return metric


class RunMetricInRunningLoopTest(unittest.TestCase):
    """Verifies ``_run_metric`` works when called from a running event loop."""

    def test_returns_float_inside_running_loop(self) -> None:
        metric = _make_metric(0.75)
        sample = object()

        async def _driver() -> float:
            # Called from within asyncio.run's loop: _run_metric must not
            # raise RuntimeError and must return the metric's float score.
            return RagasEvaluationGateway._run_metric(metric, sample)

        result = asyncio.run(_driver())

        self.assertIsInstance(result, float)
        self.assertEqual(result, 0.75)

    def test_returns_float_outside_running_loop(self) -> None:
        metric = _make_metric(0.5)
        sample = object()

        result = RagasEvaluationGateway._run_metric(metric, sample)

        self.assertIsInstance(result, float)
        self.assertEqual(result, 0.5)


if __name__ == "__main__":
    unittest.main()
