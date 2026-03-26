"""Billing context DI wiring."""

import os

from app.infrastructure.repositories.django_openai_key_repository import (
    DjangoOpenAiApiKeyRepository,
)
from app.infrastructure.repositories.django_subscription_repository import (
    DjangoSubscriptionRepository,
)
from app.use_cases.billing.check_ai_answers_limit import CheckAiAnswersLimitUseCase
from app.use_cases.billing.check_processing_limit import CheckProcessingLimitUseCase
from app.use_cases.billing.check_storage_limit import CheckStorageLimitUseCase
from app.use_cases.billing.create_billing_portal import CreateBillingPortalUseCase
from app.use_cases.billing.create_checkout_session import CreateCheckoutSessionUseCase
from app.use_cases.billing.get_plans import GetPlansUseCase
from app.use_cases.billing.get_subscription import GetSubscriptionUseCase
from app.use_cases.billing.handle_webhook import HandleWebhookUseCase
from app.use_cases.billing.record_ai_answer_usage import RecordAiAnswerUsageUseCase
from app.use_cases.billing.record_processing_usage import RecordProcessingUsageUseCase
from app.use_cases.billing.record_storage_usage import RecordStorageUsageUseCase


def _new_subscription_repo() -> DjangoSubscriptionRepository:
    return DjangoSubscriptionRepository()


def _new_openai_key_repo() -> DjangoOpenAiApiKeyRepository:
    return DjangoOpenAiApiKeyRepository()


def _new_billing_gateway():
    from app.infrastructure.billing.stripe_gateway import StripeBillingGateway
    return StripeBillingGateway()


def _billing_enabled() -> bool:
    return os.environ.get("BILLING_ENABLED", "false").lower() == "true"


def _stripe_webhook_secret() -> str:
    return os.environ.get("STRIPE_WEBHOOK_SECRET", "")


def _get_price_map() -> dict:
    """Returns price_id -> plan_name mapping for webhook handling."""
    entries = {
        os.environ.get("STRIPE_LITE_PRICE_ID_JPY", ""): "lite",
        os.environ.get("STRIPE_LITE_PRICE_ID_USD", ""): "lite",
        os.environ.get("STRIPE_STANDARD_PRICE_ID_JPY", ""): "standard",
        os.environ.get("STRIPE_STANDARD_PRICE_ID_USD", ""): "standard",
    }
    # Remove empty-string keys that arise when env vars are not set
    return {k: v for k, v in entries.items() if k}


def _get_plan_price_map() -> dict:
    """Returns PlanType -> {currency -> price_id} mapping for checkout."""
    from app.domain.billing.entities import PlanType
    return {
        PlanType.LITE: {
            "jpy": os.environ.get("STRIPE_LITE_PRICE_ID_JPY", ""),
            "usd": os.environ.get("STRIPE_LITE_PRICE_ID_USD", ""),
        },
        PlanType.STANDARD: {
            "jpy": os.environ.get("STRIPE_STANDARD_PRICE_ID_JPY", ""),
            "usd": os.environ.get("STRIPE_STANDARD_PRICE_ID_USD", ""),
        },
    }


def _new_user_repo():
    from app.infrastructure.repositories.django_user_repository import DjangoUserRepository
    return DjangoUserRepository()


def get_plans_use_case() -> GetPlansUseCase:
    return GetPlansUseCase()


def get_subscription_use_case() -> GetSubscriptionUseCase:
    return GetSubscriptionUseCase(_new_subscription_repo(), _new_openai_key_repo())


def get_create_checkout_session_use_case() -> CreateCheckoutSessionUseCase:
    return CreateCheckoutSessionUseCase(
        subscription_repo=_new_subscription_repo(),
        billing_gateway=_new_billing_gateway(),
        billing_enabled=_billing_enabled(),
        price_map=_get_plan_price_map(),
        user_repo=_new_user_repo(),
    )


def get_create_billing_portal_use_case() -> CreateBillingPortalUseCase:
    return CreateBillingPortalUseCase(
        subscription_repo=_new_subscription_repo(),
        billing_gateway=_new_billing_gateway(),
        billing_enabled=_billing_enabled(),
    )


def get_handle_webhook_use_case() -> HandleWebhookUseCase:
    return HandleWebhookUseCase(
        subscription_repo=_new_subscription_repo(),
        billing_gateway=_new_billing_gateway(),
        webhook_secret=_stripe_webhook_secret(),
        price_map=_get_price_map(),
    )


def get_check_storage_limit_use_case() -> CheckStorageLimitUseCase:
    return CheckStorageLimitUseCase(_new_subscription_repo())


def get_check_processing_limit_use_case() -> CheckProcessingLimitUseCase:
    return CheckProcessingLimitUseCase(_new_subscription_repo(), _new_openai_key_repo())


def get_check_ai_answers_limit_use_case() -> CheckAiAnswersLimitUseCase:
    return CheckAiAnswersLimitUseCase(_new_subscription_repo(), _new_openai_key_repo())


def get_record_storage_usage_use_case() -> RecordStorageUsageUseCase:
    return RecordStorageUsageUseCase(_new_subscription_repo())


def get_record_processing_usage_use_case() -> RecordProcessingUsageUseCase:
    return RecordProcessingUsageUseCase(_new_subscription_repo())


def get_record_ai_answer_usage_use_case() -> RecordAiAnswerUsageUseCase:
    return RecordAiAnswerUsageUseCase(_new_subscription_repo())
