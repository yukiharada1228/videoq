"""Media context DI wiring."""

from app.use_cases.media.resolve_protected_media import ResolveProtectedMediaUseCase


def get_resolve_protected_media_use_case() -> ResolveProtectedMediaUseCase:
    from app.infrastructure.repositories.django_media_repository import DjangoMediaRepository
    from app.infrastructure.storage.local_media_storage import LocalMediaStorage

    return ResolveProtectedMediaUseCase(DjangoMediaRepository(), LocalMediaStorage())
