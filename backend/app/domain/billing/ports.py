from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional

from app.domain.billing.entities import SubscriptionEntity


@dataclass
class SessionResult:
    """Minimal result object returned by BillingGateway session methods."""
    url: str


@dataclass
class WebhookEvent:
    """Domain representation of a Stripe webhook event.

    Isolates the rest of the codebase from stripe's StripeObject type.
    type: the Stripe event type string (e.g. "customer.subscription.created")
    data_object: the normalized subscription data used by the domain
    """
    type: str
    data_object: "SubscriptionEventData"


@dataclass
class SubscriptionEventData:
    """Normalized subscription data extracted from a Stripe webhook."""

    id: str
    customer: str
    status: str
    cancel_at_period_end: bool
    current_period_end: Optional[int]
    price_id: Optional[str]


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

    @abstractmethod
    def check_and_reserve_storage(self, user_id: int, additional_bytes: int) -> None:
        """Atomically check storage limit and reserve space if within limit.

        Uses SELECT FOR UPDATE inside a transaction to prevent race conditions
        between concurrent upload requests. If adding additional_bytes would
        exceed the plan's storage limit, raises StorageLimitExceeded without
        modifying used_storage_bytes. On success, increments used_storage_bytes
        by additional_bytes.
        """
        ...

    @abstractmethod
    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        """Atomically update used_storage_bytes by bytes_delta.

        Result is clamped to >= 0 to prevent negative storage values.
        Must use a database-level atomic operation (e.g. F() expression) to
        avoid lost updates under concurrent requests.
        """
        ...

    @abstractmethod
    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        """Atomically increment used_processing_seconds by seconds.

        Must use a database-level atomic operation (e.g. F() expression) to
        avoid lost updates under concurrent requests.
        """
        ...

    @abstractmethod
    def increment_ai_answers(self, user_id: int) -> None:
        """Atomically increment used_ai_answers by 1.

        Must use a database-level atomic operation (e.g. F() expression) to
        avoid lost updates under concurrent requests.
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
    ) -> SessionResult: ...

    @abstractmethod
    def update_subscription(self, subscription_id: str, price_id: str) -> None: ...

    @abstractmethod
    def create_billing_portal(self, customer_id: str, return_url: str) -> SessionResult: ...

    @abstractmethod
    def verify_webhook(self, payload: bytes, sig_header: str, secret: str) -> WebhookEvent: ...

    @abstractmethod
    def cancel_subscription(self, subscription_id: str) -> None: ...
