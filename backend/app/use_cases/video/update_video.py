"""
Use case: Update a video and sync PGVector metadata when the title changes.
"""

from app.domain.video.dto import UpdateVideoParams
from app.domain.video.gateways import VectorStoreGateway
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import UpdateVideoInput
from app.use_cases.video.exceptions import ResourceNotFound


class UpdateVideoUseCase:
    """
    Orchestrates video update:
    1. Retrieve the video
    2. Apply changes
    3. Sync PGVector metadata if the title changed
    """

    def __init__(self, video_repo: VideoRepository, vector_gateway: VectorStoreGateway):
        self.video_repo = video_repo
        self.vector_gateway = vector_gateway

    def execute(self, video_id: int, user_id: int, input: UpdateVideoInput):
        """
        Returns:
            VideoEntity: The updated video entity.

        Raises:
            ResourceNotFound: If the video does not exist or is not owned by the user.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        old_title = video.title
        params = UpdateVideoParams(title=input.title, description=input.description)
        video = self.video_repo.update(video, params)

        if input.title is not None and old_title != video.title:
            self.vector_gateway.update_video_title(video.id, video.title)

        return video
