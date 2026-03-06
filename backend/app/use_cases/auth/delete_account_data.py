"""
Use case: Delete all data associated with a user account (runs asynchronously).
"""

import logging

from app.domain.auth.gateways import UserDataDeletionGateway

logger = logging.getLogger(__name__)


class DeleteAccountDataUseCase:
    """
    Orchestrates deletion of all user-owned data:
    1. Delete all videos (including files)
    2. Delete chat history
    3. Delete video groups
    4. Delete tags
    """

    def __init__(self, user_data_deletion_gateway: UserDataDeletionGateway):
        self.gateway = user_data_deletion_gateway

    def execute(self, user_id: int) -> None:
        self.gateway.delete_all_videos_for_user(user_id)
        self.gateway.delete_chat_history_for_user(user_id)
        self.gateway.delete_video_groups_for_user(user_id)
        self.gateway.delete_tags_for_user(user_id)
        logger.info("Account data deleted for user %s", user_id)
