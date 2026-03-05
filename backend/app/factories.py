"""
Composition root: creates fully-wired use case instances.
Presentation layer imports from here instead of directly from infrastructure.
"""

from app.infrastructure.chat.keyword_extractor import JanomeNltkKeywordExtractor
from app.infrastructure.external.file_url_resolver import DjangoFileUrlResolver
from app.infrastructure.external.rag_gateway import RagChatGateway
from app.infrastructure.external.vector_gateway import DjangoVectorStoreGateway
from app.infrastructure.repositories.django_account_deletion_repository import (
    DjangoAccountDeletionGateway,
)
from app.infrastructure.repositories.django_user_auth_gateway import (
    DjangoEmailSenderGateway,
    DjangoUserManagementGateway,
)
from app.infrastructure.repositories.django_api_key_repository import (
    DjangoApiKeyRepository,
)
from app.infrastructure.repositories.django_chat_repository import (
    DjangoChatRepository,
    DjangoVideoGroupQueryRepository,
)
from app.infrastructure.repositories.django_user_repository import DjangoUserRepository
from app.infrastructure.repositories.django_video_repository import (
    DjangoTagRepository,
    DjangoVideoGroupRepository,
    DjangoVideoRepository,
)
from app.infrastructure.tasks.task_gateway import CeleryAuthTaskGateway, CeleryVideoTaskGateway
from app.use_cases.auth.delete_account import AccountDeletionUseCase
from app.use_cases.auth.delete_account_data import DeleteAccountDataUseCase
from app.use_cases.auth.get_current_user import GetCurrentUserUseCase
from app.use_cases.auth.signup import SignupUserUseCase
from app.use_cases.auth.verify_email import VerifyEmailUseCase
from app.use_cases.auth.reset_password import (
    RequestPasswordResetUseCase,
    ConfirmPasswordResetUseCase,
)
from app.use_cases.auth.manage_api_keys import (
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
)
from app.use_cases.chat.export_history import ExportChatHistoryUseCase
from app.use_cases.chat.get_analytics import GetChatAnalyticsUseCase
from app.use_cases.chat.get_history import GetChatHistoryUseCase
from app.use_cases.chat.get_popular_scenes import GetPopularScenesUseCase
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.chat.submit_feedback import SubmitFeedbackUseCase
from app.use_cases.video.create_group import CreateVideoGroupUseCase
from app.use_cases.video.create_tag import CreateTagUseCase
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.get_video import GetVideoDetailUseCase
from app.use_cases.video.delete_group import DeleteVideoGroupUseCase
from app.use_cases.video.delete_tag import DeleteTagUseCase
from app.use_cases.video.delete_video import DeleteVideoUseCase
from app.use_cases.video.get_group import GetSharedGroupUseCase, GetVideoGroupUseCase
from app.use_cases.video.get_tag import GetTagDetailUseCase
from app.use_cases.video.list_groups import ListVideoGroupsUseCase
from app.use_cases.video.list_tags import ListTagsUseCase
from app.use_cases.video.list_videos import ListVideosUseCase
from app.use_cases.video.manage_groups import (
    AddVideoToGroupUseCase,
    AddVideosToGroupUseCase,
    CreateShareLinkUseCase,
    DeleteShareLinkUseCase,
    RemoveVideoFromGroupUseCase,
    ReorderVideosInGroupUseCase,
)
from app.use_cases.video.manage_tags import AddTagsToVideoUseCase, RemoveTagFromVideoUseCase
from app.use_cases.video.reindex_all_videos import ReindexAllVideosUseCase
from app.use_cases.video.run_transcription import RunTranscriptionUseCase
from app.use_cases.video.update_group import UpdateVideoGroupUseCase
from app.use_cases.video.update_tag import UpdateTagUseCase
from app.use_cases.video.update_video import UpdateVideoUseCase


# ---------------------------------------------------------------------------
# Video use cases
# ---------------------------------------------------------------------------


def get_list_videos_use_case() -> ListVideosUseCase:
    return ListVideosUseCase(DjangoVideoRepository())


def get_reindex_all_videos_use_case() -> ReindexAllVideosUseCase:
    from app.infrastructure.external.vector_gateway import DjangoVectorIndexingGateway

    return ReindexAllVideosUseCase(DjangoVideoRepository(), DjangoVectorIndexingGateway())


def get_run_transcription_use_case() -> RunTranscriptionUseCase:
    from app.infrastructure.external.transcription_gateway import WhisperTranscriptionGateway
    from app.infrastructure.external.vector_gateway import DjangoVectorIndexingGateway

    return RunTranscriptionUseCase(
        DjangoVideoRepository(),
        WhisperTranscriptionGateway(),
        DjangoVectorIndexingGateway(),
    )


def get_video_detail_use_case() -> GetVideoDetailUseCase:
    return GetVideoDetailUseCase(DjangoVideoRepository())


def get_create_video_use_case() -> CreateVideoUseCase:
    return CreateVideoUseCase(DjangoVideoRepository(), CeleryVideoTaskGateway())


def get_update_video_use_case() -> UpdateVideoUseCase:
    return UpdateVideoUseCase(DjangoVideoRepository(), DjangoVectorStoreGateway())


def get_delete_video_use_case() -> DeleteVideoUseCase:
    return DeleteVideoUseCase(DjangoVideoRepository())


# ---------------------------------------------------------------------------
# Video group use cases
# ---------------------------------------------------------------------------


def get_list_groups_use_case() -> ListVideoGroupsUseCase:
    return ListVideoGroupsUseCase(DjangoVideoGroupRepository())


def get_create_group_use_case() -> CreateVideoGroupUseCase:
    return CreateVideoGroupUseCase(DjangoVideoGroupRepository())


def get_update_group_use_case() -> UpdateVideoGroupUseCase:
    return UpdateVideoGroupUseCase(DjangoVideoGroupRepository())


def get_delete_group_use_case() -> DeleteVideoGroupUseCase:
    return DeleteVideoGroupUseCase(DjangoVideoGroupRepository())


def get_video_group_use_case() -> GetVideoGroupUseCase:
    return GetVideoGroupUseCase(DjangoVideoGroupRepository())


def get_shared_group_use_case() -> GetSharedGroupUseCase:
    return GetSharedGroupUseCase(DjangoVideoGroupRepository())


def get_add_video_to_group_use_case() -> AddVideoToGroupUseCase:
    return AddVideoToGroupUseCase(DjangoVideoRepository(), DjangoVideoGroupRepository())


def get_add_videos_to_group_use_case() -> AddVideosToGroupUseCase:
    return AddVideosToGroupUseCase(DjangoVideoGroupRepository())


def get_remove_video_from_group_use_case() -> RemoveVideoFromGroupUseCase:
    return RemoveVideoFromGroupUseCase(DjangoVideoRepository(), DjangoVideoGroupRepository())


def get_reorder_videos_use_case() -> ReorderVideosInGroupUseCase:
    return ReorderVideosInGroupUseCase(DjangoVideoGroupRepository())


def get_create_share_link_use_case() -> CreateShareLinkUseCase:
    return CreateShareLinkUseCase(DjangoVideoGroupRepository())


def get_delete_share_link_use_case() -> DeleteShareLinkUseCase:
    return DeleteShareLinkUseCase(DjangoVideoGroupRepository())


# ---------------------------------------------------------------------------
# Tag use cases
# ---------------------------------------------------------------------------


def get_list_tags_use_case() -> ListTagsUseCase:
    return ListTagsUseCase(DjangoTagRepository())


def get_create_tag_use_case() -> CreateTagUseCase:
    return CreateTagUseCase(DjangoTagRepository())


def get_update_tag_use_case() -> UpdateTagUseCase:
    return UpdateTagUseCase(DjangoTagRepository())


def get_delete_tag_use_case() -> DeleteTagUseCase:
    return DeleteTagUseCase(DjangoTagRepository())


def get_tag_detail_use_case() -> GetTagDetailUseCase:
    return GetTagDetailUseCase(DjangoTagRepository())


def get_add_tags_to_video_use_case() -> AddTagsToVideoUseCase:
    return AddTagsToVideoUseCase(DjangoVideoRepository(), DjangoTagRepository())


def get_remove_tag_from_video_use_case() -> RemoveTagFromVideoUseCase:
    return RemoveTagFromVideoUseCase(DjangoVideoRepository(), DjangoTagRepository())


# ---------------------------------------------------------------------------
# Chat use cases
# ---------------------------------------------------------------------------


def get_send_message_use_case() -> SendMessageUseCase:
    return SendMessageUseCase(
        DjangoChatRepository(),
        DjangoVideoGroupQueryRepository(),
        RagChatGateway(),
    )


def get_chat_history_use_case() -> GetChatHistoryUseCase:
    return GetChatHistoryUseCase(DjangoChatRepository(), DjangoVideoGroupQueryRepository())


def get_chat_analytics_use_case() -> GetChatAnalyticsUseCase:
    return GetChatAnalyticsUseCase(
        DjangoChatRepository(),
        DjangoVideoGroupQueryRepository(),
        JanomeNltkKeywordExtractor(),
    )


def get_popular_scenes_use_case() -> GetPopularScenesUseCase:
    return GetPopularScenesUseCase(
        DjangoChatRepository(),
        DjangoVideoGroupQueryRepository(),
        DjangoVideoRepository(),
    )


def get_submit_feedback_use_case() -> SubmitFeedbackUseCase:
    return SubmitFeedbackUseCase(DjangoChatRepository())


def get_export_history_use_case() -> ExportChatHistoryUseCase:
    return ExportChatHistoryUseCase(DjangoChatRepository(), DjangoVideoGroupQueryRepository())


# ---------------------------------------------------------------------------
# Auth use cases
# ---------------------------------------------------------------------------


def get_current_user_use_case() -> GetCurrentUserUseCase:
    return GetCurrentUserUseCase(DjangoUserRepository())


def get_signup_use_case() -> SignupUserUseCase:
    return SignupUserUseCase(DjangoUserManagementGateway(), DjangoEmailSenderGateway())


def get_verify_email_use_case() -> VerifyEmailUseCase:
    return VerifyEmailUseCase(DjangoUserManagementGateway())


def get_request_password_reset_use_case() -> RequestPasswordResetUseCase:
    return RequestPasswordResetUseCase(
        DjangoUserManagementGateway(), DjangoEmailSenderGateway()
    )


def get_confirm_password_reset_use_case() -> ConfirmPasswordResetUseCase:
    return ConfirmPasswordResetUseCase(DjangoUserManagementGateway())


def get_delete_account_use_case() -> AccountDeletionUseCase:
    return AccountDeletionUseCase(
        DjangoAccountDeletionGateway(),
        CeleryAuthTaskGateway(),
    )


def get_delete_account_data_use_case() -> DeleteAccountDataUseCase:
    from app.infrastructure.repositories.django_user_data_deletion_gateway import (
        DjangoUserDataDeletionGateway,
    )

    return DeleteAccountDataUseCase(DjangoUserDataDeletionGateway())


# ---------------------------------------------------------------------------
# API key use cases
# ---------------------------------------------------------------------------


def get_list_api_keys_use_case() -> ListApiKeysUseCase:
    return ListApiKeysUseCase(DjangoApiKeyRepository())


def get_create_api_key_use_case() -> CreateApiKeyUseCase:
    return CreateApiKeyUseCase(DjangoApiKeyRepository())


def get_revoke_api_key_use_case() -> RevokeApiKeyUseCase:
    return RevokeApiKeyUseCase(DjangoApiKeyRepository())


# ---------------------------------------------------------------------------
# Infrastructure utilities
# ---------------------------------------------------------------------------


def get_file_url_resolver() -> DjangoFileUrlResolver:
    return DjangoFileUrlResolver()
