import os

from django.conf import settings
from django.http import Http404

from app.media import repositories


def resolve_protected_media(path: str):
    """Return the local file path and matching video, or raise 404."""
    file_path = os.path.join(settings.MEDIA_ROOT, path)
    if not os.path.exists(file_path):
        raise Http404()

    video = repositories.get_video_by_file(file_path=path)
    if not video:
        raise Http404()

    return file_path, video


def assert_video_access(*, video, request_user=None, share_group=None) -> None:
    """Raise 404 when the requester does not have access to the video."""
    if share_group is not None:
        if not repositories.group_has_video(group=share_group, video=video):
            raise Http404()
        return

    if request_user and request_user.is_authenticated:
        if video.user != request_user:
            raise Http404()
        return

    raise Http404()
