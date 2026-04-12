"""Usage-limit DI wiring."""

from app.infrastructure.repositories.django_subscription_repository import DjangoUserLimitsRepository
from app.use_cases.billing.check_ai_answers_limit import CheckAiAnswersLimitUseCase
from app.use_cases.billing.check_processing_limit import CheckProcessingLimitUseCase
from app.use_cases.billing.check_storage_limit import CheckStorageLimitUseCase
from app.use_cases.billing.clear_over_quota import ClearOverQuotaIfWithinLimitUseCase
from app.use_cases.billing.record_ai_answer_usage import RecordAiAnswerUsageUseCase
from app.use_cases.billing.record_processing_usage import RecordProcessingUsageUseCase
from app.use_cases.billing.record_storage_usage import RecordStorageUsageUseCase


def _new_user_limits_repo() -> DjangoUserLimitsRepository:
    return DjangoUserLimitsRepository()


def get_check_storage_limit_use_case() -> CheckStorageLimitUseCase:
    return CheckStorageLimitUseCase(_new_user_limits_repo())


def get_check_processing_limit_use_case() -> CheckProcessingLimitUseCase:
    return CheckProcessingLimitUseCase(_new_user_limits_repo())


def get_check_ai_answers_limit_use_case() -> CheckAiAnswersLimitUseCase:
    return CheckAiAnswersLimitUseCase(_new_user_limits_repo())


def get_record_storage_usage_use_case() -> RecordStorageUsageUseCase:
    return RecordStorageUsageUseCase(_new_user_limits_repo())


def get_record_processing_usage_use_case() -> RecordProcessingUsageUseCase:
    return RecordProcessingUsageUseCase(_new_user_limits_repo())


def get_record_ai_answer_usage_use_case() -> RecordAiAnswerUsageUseCase:
    return RecordAiAnswerUsageUseCase(_new_user_limits_repo())


def get_clear_over_quota_if_within_limit_use_case() -> ClearOverQuotaIfWithinLimitUseCase:
    return ClearOverQuotaIfWithinLimitUseCase(_new_user_limits_repo())
