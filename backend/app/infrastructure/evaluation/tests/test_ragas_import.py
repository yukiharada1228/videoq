"""Smoke tests verifying the ``ragas`` dependency and required submodules import.

These tests guard against a missing or incompatible ``ragas`` install by
importing every symbol :class:`RagasEvaluationGateway` relies on. A failure
here means the evaluation gateway would raise at runtime, so the test acts as
an early, dependency-only signal independent of the gateway's own logic (§11.4).

Dependency note (root cause fixed 2026-06-21): ``ragas==0.4.3`` hard-imports
``langchain_community.chat_models.vertexai`` at package import time, which was
removed in ``langchain-community==0.4.x``. ``requirements.txt`` therefore pins
``langchain-community==0.3.31`` (still ships that module and allows
langchain-core<2.0). If these imports break again, that pin has drifted — keep
``ragas`` and ``langchain-community`` in lock-step.
"""

import unittest


class RagasImportTest(unittest.TestCase):
    """Asserts ``ragas`` and the submodules used by the gateway are importable."""

    def test_dataset_schema_single_turn_sample(self) -> None:
        from ragas.dataset_schema import SingleTurnSample

        self.assertIsNotNone(SingleTurnSample)

    def test_metrics(self) -> None:
        from ragas.metrics import (
            Faithfulness,
            LLMContextPrecisionWithoutReference,
            ResponseRelevancy,
        )

        self.assertIsNotNone(Faithfulness)
        self.assertIsNotNone(LLMContextPrecisionWithoutReference)
        self.assertIsNotNone(ResponseRelevancy)

    def test_llms_wrapper(self) -> None:
        from ragas.llms import LangchainLLMWrapper

        self.assertIsNotNone(LangchainLLMWrapper)

    def test_embeddings_wrapper(self) -> None:
        from ragas.embeddings import LangchainEmbeddingsWrapper

        self.assertIsNotNone(LangchainEmbeddingsWrapper)


if __name__ == "__main__":
    unittest.main()
