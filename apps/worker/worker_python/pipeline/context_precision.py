"""Bounded context verification with RAGAS's existing ranking and scoring."""

from __future__ import annotations

import asyncio

from ragas.metrics import LLMContextPrecisionWithoutReference
from ragas.metrics._context_precision import QAC, Verification
from ragas.metrics.base import ensembler


MAX_CONCURRENT_CONTEXTS = 4


class ParallelContextPrecision(LLMContextPrecisionWithoutReference):
    """RAGAS 0.4 verifies contexts serially; keep its prompts and aggregation.

    All contexts are scored, and gather preserves retrieval order even when
    requests finish out of order. This adapter is covered against the upstream
    metric so upgrading the pinned RAGAS minor version checks score parity.
    """

    async def _ascore(self, row, callbacks):
        assert self.llm is not None, "LLM is not set"
        question, contexts, answer = self._get_row_attributes(row)
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_CONTEXTS)

        async def verify(context):
            async with semaphore:
                verdicts = await self.context_precision_prompt.generate_multiple(
                    data=QAC(question=question, context=context, answer=answer),
                    llm=self.llm,
                    callbacks=callbacks,
                )
            response = [result.model_dump() for result in verdicts]
            aggregated = ensembler.from_discrete([response], "verdict")
            return Verification(**aggregated[0])

        tasks = [asyncio.create_task(verify(context)) for context in contexts]
        try:
            verifications = await asyncio.gather(*tasks)
        finally:
            # A failed request or metric cancellation must not leave requests
            # running when the job closes its HTTP clients and event loop.
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        return self._calculate_average_precision(verifications)
