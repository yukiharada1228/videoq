"""RAGAS-based implementation of RagEvaluationGateway."""

import asyncio
import logging
from typing import List, Optional

from app.domain.evaluation.gateways import EvaluationScores, RagEvaluationGateway
from app.infrastructure.common.embeddings import get_embeddings
from app.infrastructure.external.llm import get_langchain_llm

logger = logging.getLogger(__name__)


class RagasEvaluationGateway(RagEvaluationGateway):
    """Runs RAGAS evaluation using vibrantlabsai/ragas.

    Metrics (all reference-free, no ground truth needed):
    - faithfulness: Is the answer grounded in retrieved contexts?
    - answer_relevancy (ResponseRelevancy): Is the answer relevant to the question?
    - context_precision (LLMContextPrecisionWithoutReference): Are contexts used?
    """

    def evaluate(
        self,
        question: str,
        answer: str,
        retrieved_contexts: List[str],
    ) -> EvaluationScores:
        try:
            from ragas.dataset_schema import SingleTurnSample
            from ragas.metrics import (
                Faithfulness,
                LLMContextPrecisionWithoutReference,
                ResponseRelevancy,
            )
            from ragas.llms import LangchainLLMWrapper
        except ImportError as exc:
            raise RuntimeError(
                "ragas is not installed. Add it to requirements.txt."
            ) from exc

        llm = get_langchain_llm()
        wrapped_llm = LangchainLLMWrapper(llm)

        from ragas.embeddings import LangchainEmbeddingsWrapper
        wrapped_embeddings = LangchainEmbeddingsWrapper(get_embeddings())

        sample = SingleTurnSample(
            user_input=question,
            response=answer,
            retrieved_contexts=retrieved_contexts or [""],
        )

        faithfulness_score = self._run_metric(
            Faithfulness(llm=wrapped_llm), sample
        )
        relevancy_score = self._run_metric(
            ResponseRelevancy(llm=wrapped_llm, embeddings=wrapped_embeddings), sample
        )
        # context_precision requires at least one retrieved context
        precision_score: Optional[float] = None
        if retrieved_contexts:
            precision_score = self._run_metric(
                LLMContextPrecisionWithoutReference(llm=wrapped_llm), sample
            )

        return EvaluationScores(
            faithfulness=faithfulness_score,
            answer_relevancy=relevancy_score,
            context_precision=precision_score,
        )

    @staticmethod
    def _run_metric(metric, sample) -> Optional[float]:
        try:
            score = asyncio.run(metric.single_turn_ascore(sample))
            return float(score) if score is not None else None
        except Exception as exc:
            logger.warning("Metric %s failed: %s", metric.__class__.__name__, exc)
            return None
