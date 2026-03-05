"""
Media bounded context factories.
Constructs fully-wired media use case instances.
"""

from app.use_cases.media.resolve_protected_media import ResolveProtectedMediaUseCase


def get_resolve_protected_media_use_case() -> ResolveProtectedMediaUseCase:
    from app.infrastructure.repositories.django_media_repository import DjangoMediaRepository

    return ResolveProtectedMediaUseCase(DjangoMediaRepository())
