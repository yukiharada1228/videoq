"""
Use case: Delete a video (hard delete) and clean up its file.
"""

from django.db import transaction

from app.domain.video.repositories import VideoRepository
from app.use_cases.video.exceptions import ResourceNotFound


class DeleteVideoUseCase:
    """
    Orchestrates video deletion:
    1. Retrieve the video
    2. Delete the DB record (CASCADE handles VideoGroupMember; post_delete signal handles vectors)
    3. Delete the file after the transaction commits
    """

    def __init__(self, video_repo: VideoRepository):
        self.video_repo = video_repo

    @transaction.atomic
    def execute(self, video_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the video does not exist or is not owned by the user.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        file_ref = video.file if video.file else None
        self.video_repo.delete(video)

        if file_ref:
            transaction.on_commit(lambda: file_ref.delete(save=False))
