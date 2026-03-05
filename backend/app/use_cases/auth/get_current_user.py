"""
Use case: Retrieve the current authenticated user with their video count.
"""

from app.domain.user.repositories import UserRepository


class GetCurrentUserUseCase:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    def execute(self, user_id: int):
        return self.user_repository.get_with_video_count(user_id)
