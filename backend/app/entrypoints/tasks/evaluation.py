"""Celery task: run RAGAS evaluation for a single ChatLog."""

import logging

from celery import shared_task

from app.contracts.tasks import EVALUATE_CHAT_LOG_TASK
from app.dependencies.evaluation import get_evaluate_chat_log_use_case

logger = logging.getLogger(__name__)


@shared_task(name=EVALUATE_CHAT_LOG_TASK)
def evaluate_chat_log(chat_log_id: int) -> None:
    """Run RAGAS evaluation for the given ChatLog and persist the result.

    Errors are recorded in ChatLogEvaluation (status='failed') and never
    re-raised so the Celery worker does not retry.
    """
    logger.info("Evaluation task started for ChatLog %s", chat_log_id)
    get_evaluate_chat_log_use_case().execute(chat_log_id=chat_log_id)
    logger.info("Evaluation task finished for ChatLog %s", chat_log_id)
