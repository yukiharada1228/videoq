"""
Use case: Request a presigned upload URL for direct-to-storage video upload.
"""

import logging
import os
import time

from app.domain.shared.transaction import TransactionPort
from app.domain.user.repositories import UserRepository
from app.domain.video.dto import CreateVideoPendingParams
from app.domain.video.gateways import FileUploadGateway
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import RequestUploadInput, UploadRequestResponseDTO
from app.use_cases.video.exceptions import FileSizeExceeded, ResourceNotFound
from app.use_cases.video.file_url import to_video_response_dto

logger = logging.getLogger(__name__)

ALLOWED_VIDEO_EXTENSIONS = {
    ".mp4", ".mov", ".avi", ".mkv", ".webm",
    ".m4v", ".mpeg", ".mpg", ".3gp",
}

ALLOWED_VIDEO_MIMETYPES = {
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
    "video/x-m4v",
    "video/mpeg",
    "video/3gpp",
}

class RequestVideoUploadUseCase:
    """
    Orchestrates presigned-URL video upload request:
    1. Validate user exists + quota
    2. Validate extension / content_type / file_size
    3. Generate file_key
    4. Create Video record (status=UPLOADING)
    5. Generate presigned PUT URL
    6. Return UploadRequestResponseDTO
    """

    def __init__(
        self,
        user_repo: UserRepository,
        video_repo: VideoRepository,
        upload_gateway: FileUploadGateway,
        tx: TransactionPort,
    ):
        self.user_repo = user_repo
        self.video_repo = video_repo
        self.upload_gateway = upload_gateway
        self.tx = tx

    def execute(self, user_id: int, input: RequestUploadInput) -> UploadRequestResponseDTO:
        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise ResourceNotFound("User")

        ext = os.path.splitext(input.filename)[1].lower()
        if ext not in ALLOWED_VIDEO_EXTENSIONS:
            raise ValueError(
                f"Unsupported file type: '{ext}'. "
                f"Allowed types: {', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))}"
            )
        if input.content_type not in ALLOWED_VIDEO_MIMETYPES:
            raise ValueError(
                f"Invalid content type: '{input.content_type}'. Only video files are allowed."
            )
        max_upload_bytes = user.get_max_upload_size_bytes()
        if input.file_size > max_upload_bytes:
            raise FileSizeExceeded(max_upload_bytes // (1024 * 1024))

        with self.tx.atomic():
            timestamp_ms = int(time.time() * 1000)
            file_key = f"videos/{user_id}/video_{timestamp_ms}{ext}"

            params = CreateVideoPendingParams(
                file_key=file_key,
                title=input.title,
                description=input.description,
            )
            video = self.video_repo.create_pending(user_id, params)

        upload_url = self.upload_gateway.generate_upload_url(file_key, input.content_type)

        logger.info("Generated presigned upload URL for video ID: %s", video.id)
        return UploadRequestResponseDTO(
            video=to_video_response_dto(video),
            upload_url=upload_url,
        )
