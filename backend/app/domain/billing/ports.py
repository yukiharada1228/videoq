from abc import ABC, abstractmethod
from typing import Optional

from app.domain.billing.entities import SubscriptionEntity


class SubscriptionRepository(ABC):
    @abstractmethod
    def get_or_create(self, user_id: int) -> SubscriptionEntity: ...

    @abstractmethod
    def get_by_user_id(self, user_id: int) -> Optional[SubscriptionEntity]: ...

    @abstractmethod
    def get_by_stripe_customer_id(self, customer_id: str) -> Optional[SubscriptionEntity]: ...

    @abstractmethod
    def save(self, entity: SubscriptionEntity) -> SubscriptionEntity: ...

    @abstractmethod
    def create_stripe_customer(self, user_id: int, customer_id: str) -> SubscriptionEntity: ...

    @abstractmethod
    def reset_monthly_usage(self, user_id: int, period_start) -> None: ...

    @abstractmethod
    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        """Reset monthly usage counters if a new billing period has started.

        For free users (no current_period_end): resets if usage_period_start is
        from a previous calendar month.
        For paid users: resets if we are past the previous period_start + 1 month.
        After a reset, usage_period_start is updated to now and
        used_processing_seconds / used_ai_answers are zeroed out.
        """
        ...


class BillingGateway(ABC):
    @abstractmethod
    def get_or_create_customer(self, user_id: int, email: str, username: str) -> str: ...

    @abstractmethod
    def create_checkout_session(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        user_id: int,
        plan: str,
    ) -> object: ...

    @abstractmethod
    def update_subscription(self, subscription_id: str, price_id: str) -> None: ...

    @abstractmethod
    def create_billing_portal(self, customer_id: str, return_url: str) -> object: ...

    @abstractmethod
    def retrieve_subscription(self, subscription_id: str) -> dict: ...

    @abstractmethod
    def verify_webhook(self, payload: bytes, sig_header: str, secret: str) -> dict: ...
