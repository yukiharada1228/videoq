"""Use case: create a YouTube-backed video and dispatch transcript ingestion."""

import logging

from app.domain.shared.transaction import TransactionPort
from app.domain.user.repositories import UserRepository
from app.domain.video.dto import CreateYoutubeVideoParams
from app.domain.video.gateways import VideoTaskGateway
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import CreateYoutubeVideoInput, VideoResponseDTO
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import to_video_response_dto
from app.use_cases.video.youtube import extract_youtube_video_id

logger = logging.getLogger(__name__)


class CreateYoutubeVideoUseCase:
    def __init__(
        self,
        user_repo: UserRepository,
        video_repo: VideoRepository,
        task_queue: VideoTaskGateway,
        tx: TransactionPort,
    ):
        self.user_repo = user_repo
        self.video_repo = video_repo
        self.task_queue = task_queue
        self.tx = tx

    def execute(self, user_id: int, input: CreateYoutubeVideoInput) -> VideoResponseDTO:
        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise ResourceNotFound("User")

        youtube_video_id = extract_youtube_video_id(input.youtube_url)

        with self.tx.atomic():
            video = self.video_repo.create_youtube(
                user_id,
                CreateYoutubeVideoParams(
                    source_url=input.youtube_url,
                    youtube_video_id=youtube_video_id,
                    title=input.title,
                    description=input.description,
                ),
            )
            logger.info("Enqueueing YouTube transcription task for video ID: %s", video.id)
            self.task_queue.enqueue_transcription(video.id)

        return to_video_response_dto(video)
