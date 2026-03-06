"""
Account deletion task trigger.
Delegates all data deletion logic to DeleteAccountDataUseCase.
"""

import logging

from celery import shared_task

from app.dependencies.tasks import get_delete_account_data_use_case

logger = logging.getLogger(__name__)


@shared_task(bind=True, name="app.presentation.tasks.account_deletion.delete_account_data")
def delete_account_data(self, user_id: int) -> None:
    logger.info("Account deletion task started for user %s", user_id)
    get_delete_account_data_use_case().execute(user_id)
