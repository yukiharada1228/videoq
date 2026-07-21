"""Use case: enqueue PLOG rebuild."""

from __future__ import annotations

from app.domain.plog.repositories import PlogRepository
from app.domain.video.gateways import VideoTaskGateway
from app.domain.video.repositories import VideoQueryRepository
from app.use_cases.shared.exceptions import ResourceNotFound


class RebuildPlogUseCase:
    def __init__(
        self,
        video_repo: VideoQueryRepository,
        plog_repo: PlogRepository,
        task_gateway: VideoTaskGateway,
    ):
        self.video_repo = video_repo
        self.plog_repo = plog_repo
        self.task_gateway = task_gateway

    def execute(self, video_id: int, user_id: int) -> dict:
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")
        if not video.transcript:
            raise ResourceNotFound("Transcript")

        latest = self.plog_repo.get_latest_build_job(video_id)
        if latest and latest.status in {"pending", "running"}:
            self.task_gateway.enqueue_build_plog(video_id)
            return {
                "video_id": video_id,
                "status": latest.status,
                "job_id": latest.id,
            }

        job = self.plog_repo.create_build_job(video_id)
        self.task_gateway.enqueue_build_plog(video_id)
        return {
            "video_id": video_id,
            "status": job.status,
            "job_id": job.id,
        }
