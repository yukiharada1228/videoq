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
            raise ResourceNotFound("Authenticated user")
        return CurrentUserOutput(
            id=user.id,
            username=user.username,
            email=user.email,
            is_active=user.is_active,
            video_limit=user.video_limit,
            video_count=user.video_count,
        )
