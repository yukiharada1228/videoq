"""Video context DI wiring facade."""

from app.domain.video.gateways import VideoTaskGateway

from . import _video_core_providers as core
from . import _video_group_providers as group
from . import _video_shared as shared
from . import _video_tag_providers as tag


class TranscriptionTargetMissing(Exception):
    """Composition-root boundary error for missing transcription target."""


class TranscriptionExecutionFailed(Exception):
    """Composition-root boundary error for failed transcription execution."""


def get_list_videos_use_case():
    return core.get_list_videos_use_case()


def get_reindex_all_videos_use_case():
    return core.get_reindex_all_videos_use_case()


def get_run_transcription_use_case():
    return core.get_run_transcription_use_case()


def run_transcription(video_id: int) -> None:
    from app.use_cases.video.exceptions import (
        TranscriptionExecutionFailed as UseCaseTranscriptionExecutionFailed,
        TranscriptionTargetMissing as UseCaseTranscriptionTargetMissing,
    )

    try:
        get_run_transcription_use_case().execute(video_id)
    except UseCaseTranscriptionTargetMissing as exc:
        raise TranscriptionTargetMissing(str(exc)) from exc
    except UseCaseTranscriptionExecutionFailed as exc:
        raise TranscriptionExecutionFailed(str(exc)) from exc


def get_video_detail_use_case():
    return core.get_video_detail_use_case()


def get_create_video_use_case():
    return core.get_create_video_use_case()


def get_video_task_gateway() -> VideoTaskGateway:
    return shared.get_video_task_gateway()


def get_update_video_use_case():
    return core.get_update_video_use_case()


def get_delete_video_use_case():
    return core.get_delete_video_use_case()


def get_enforce_video_limit_use_case():
    return core.get_enforce_video_limit_use_case()


def get_list_groups_use_case():
    return group.get_list_groups_use_case()


def get_create_group_use_case():
    return group.get_create_group_use_case()


def get_update_group_use_case():
    return group.get_update_group_use_case()


def get_delete_group_use_case():
    return group.get_delete_group_use_case()


def get_video_group_use_case():
    return group.get_video_group_use_case()


def get_shared_group_use_case():
    return group.get_shared_group_use_case()


def get_add_video_to_group_use_case():
    return group.get_add_video_to_group_use_case()


def get_add_videos_to_group_use_case():
    return group.get_add_videos_to_group_use_case()


def get_remove_video_from_group_use_case():
    return group.get_remove_video_from_group_use_case()


def get_reorder_videos_use_case():
    return group.get_reorder_videos_use_case()


def get_create_share_link_use_case():
    return group.get_create_share_link_use_case()


def get_delete_share_link_use_case():
    return group.get_delete_share_link_use_case()


def get_list_tags_use_case():
    return tag.get_list_tags_use_case()


def get_create_tag_use_case():
    return tag.get_create_tag_use_case()


def get_update_tag_use_case():
    return tag.get_update_tag_use_case()


def get_delete_tag_use_case():
    return tag.get_delete_tag_use_case()


def get_tag_detail_use_case():
    return tag.get_tag_detail_use_case()


def get_add_tags_to_video_use_case():
    return tag.get_add_tags_to_video_use_case()


def get_remove_tag_from_video_use_case():
    return tag.get_remove_tag_from_video_use_case()
