"""
Use case: Delete all data associated with a user account (runs asynchronously).
"""

import logging

from app.domain.auth.gateways import UserDataDeletionGateway

logger = logging.getLogger(__name__)


class DeleteAccountDataUseCase:
    """
    Orchestrates deletion of all user-owned data:
    1. Delete all videos (including R2 files)
    2. Delete chat history
    3. Delete video groups
    4. Delete tags
    5. Finalize deletion
    """

    def __init__(self, user_data_deletion_gateway: UserDataDeletionGateway):
        self.gateway = user_data_deletion_gateway

    def execute(self, user_id: int) -> None:
        data_steps = [
            ("delete_all_videos_for_user", self.gateway.delete_all_videos_for_user),
            ("delete_chat_history_for_user", self.gateway.delete_chat_history_for_user),
            ("delete_video_groups_for_user", self.gateway.delete_video_groups_for_user),
            ("delete_tags_for_user", self.gateway.delete_tags_for_user),
        ]
        for step_name, step in data_steps:
            try:
                step(user_id)
            except Exception:
                logger.error(
                    "Account deletion step %s failed for user %s",
                    step_name,
                    user_id,
                    exc_info=True,
                )
        logger.info("Account data deletion completed for user %s", user_id)
