"""
Use case: Retrieve the current authenticated user with their video count.
"""

from app.domain.user.repositories import UserRepository
from app.use_cases.auth.dto import CurrentUserOutput
from app.use_cases.shared.exceptions import ResourceNotFound


class GetCurrentUserUseCase:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    def execute(self, user_id: int) -> CurrentUserOutput:
        user = self.user_repository.get_with_video_count(user_id)
        if user is None:
            raise ResourceNotFound("User")
        return CurrentUserOutput(
            id=user.id,
            username=user.username,
            email=user.email,
            is_active=user.is_active,
            video_count=user.video_count,
            max_video_upload_size_mb=user.max_video_upload_size_mb,
            used_storage_bytes=user.used_storage_bytes,
            storage_limit_bytes=(
                None
                if user.storage_limit_gb is None
                else int(user.storage_limit_gb * 1024 ** 3)
            ),
            used_processing_seconds=user.used_processing_seconds,
            processing_limit_seconds=(
                None
                if user.processing_limit_minutes is None
                else user.processing_limit_minutes * 60
            ),
            used_ai_answers=user.used_ai_answers,
            ai_answers_limit=user.ai_answers_limit,
            is_over_quota=user.is_over_quota,
        )
