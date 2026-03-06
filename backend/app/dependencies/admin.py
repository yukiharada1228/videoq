"""Admin dependency providers."""

from app.composition_root import video as _video_cr


def get_enforce_video_limit_use_case():
    return _video_cr.get_enforce_video_limit_use_case()


def get_video_task_gateway():
    return _video_cr.get_video_task_gateway()
