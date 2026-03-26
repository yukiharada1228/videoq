"""Shared factories/gateways for video composition root providers."""

from functools import lru_cache

from app.domain.video.gateways import VideoTaskGateway
from app.infrastructure.external.vector_gateway import DjangoVectorStoreGateway
from app.infrastructure.repositories.django_user_repository import DjangoUserRepository
from app.infrastructure.repositories.django_video_repository import (
    DjangoTagRepository,
    DjangoVideoGroupRepository,
    DjangoVideoRepository,
)
from app.infrastructure.tasks.task_gateway import CeleryVideoTaskGateway


def new_video_repository() -> DjangoVideoRepository:
    return DjangoVideoRepository()


def new_video_group_repository() -> DjangoVideoGroupRepository:
    return DjangoVideoGroupRepository()


def new_tag_repository() -> DjangoTagRepository:
    return DjangoTagRepository()


def new_user_repository() -> DjangoUserRepository:
    return DjangoUserRepository()


def new_video_task_gateway() -> CeleryVideoTaskGateway:
    return CeleryVideoTaskGateway()


def new_vector_store_gateway() -> DjangoVectorStoreGateway:
    return DjangoVectorStoreGateway()


def get_video_task_gateway() -> VideoTaskGateway:
    return new_video_task_gateway()


@lru_cache(maxsize=1)
def get_vector_indexing_gateway():
    from app.infrastructure.external.vector_gateway import DjangoVectorIndexingGateway

    return DjangoVectorIndexingGateway()


@lru_cache(maxsize=1)
def get_file_upload_gateway():
    from django.conf import settings
    from app.infrastructure.external.file_upload_gateway import (
        LocalFileUploadGateway,
        R2FileUploadGateway,
    )

    if getattr(settings, "USE_S3_STORAGE", False):
        return R2FileUploadGateway()
    return LocalFileUploadGateway()


@lru_cache(maxsize=1)
def get_video_file_accessor():
    from app.infrastructure.transcription.video_file_accessor import DjangoVideoFileAccessor

    return DjangoVideoFileAccessor()


@lru_cache(maxsize=1)
def get_whisper_transcription_gateway():
    from app.infrastructure.external.transcription_gateway import WhisperTranscriptionGateway

    return WhisperTranscriptionGateway(get_video_file_accessor())
