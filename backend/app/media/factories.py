from django.contrib.auth import get_user_model

from app.common.actors import DjangoActorLoader
from app.media.services import assert_video_access, resolve_protected_media
from app.media.use_cases import GetProtectedMediaUseCase

User = get_user_model()


def get_protected_media_use_case() -> GetProtectedMediaUseCase:
    return GetProtectedMediaUseCase(
        media_file_resolver=resolve_protected_media,
        video_access_authorizer=assert_video_access,
        actor_loader=DjangoActorLoader(User),
    )
