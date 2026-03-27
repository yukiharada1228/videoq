from app.domain.billing.entities import PlanType
from app.domain.billing.ports import (
    BillingGateway,
    SubscriptionEventData,
    SubscriptionRepository,
    WebhookEvent,
)


class HandleWebhookUseCase:
    def __init__(
        self,
        subscription_repo: SubscriptionRepository,
        billing_gateway: BillingGateway,
        webhook_secret: str,
        price_map: dict,  # {"price_xxx": "lite", "price_yyy": "standard"}
    ):
        self._subscription_repo = subscription_repo
        self._billing_gateway = billing_gateway
        self._webhook_secret = webhook_secret
        self._price_map = price_map  # price_id -> plan_name

    def execute(self, payload: bytes, sig_header: str) -> None:
        event = self._billing_gateway.verify_webhook(
            payload=payload,
            sig_header=sig_header,
            secret=self._webhook_secret,
        )
        self._handle_event(event)

    def _handle_event(self, event: WebhookEvent) -> None:
        if event.type in (
            "customer.subscription.created",
            "customer.subscription.updated",
        ):
            self._sync_subscription(event.data_object)
        elif event.type == "customer.subscription.deleted":
            self._revert_to_free(event.data_object)

    def _sync_subscription(self, subscription_data: SubscriptionEventData) -> None:
        customer_id = subscription_data.customer
        if not customer_id:
            return

        entity = self._subscription_repo.get_by_stripe_customer_id(customer_id)
        if entity is None:
            return

        subscription_id = subscription_data.id
        status = subscription_data.status
        cancel_at_period_end = subscription_data.cancel_at_period_end

        plan_type = entity.plan  # keep existing if not found
        if subscription_data.price_id:
            plan_name = self._price_map.get(subscription_data.price_id)
            if plan_name:
                try:
                    plan_type = PlanType(plan_name)
                except ValueError:
                    pass

        current_period_end = None
        raw_end = subscription_data.current_period_end
        if raw_end:
            from datetime import datetime, timezone
            current_period_end = datetime.fromtimestamp(raw_end, tz=timezone.utc)

        entity.stripe_subscription_id = subscription_id
        entity.stripe_status = status
        entity.plan = plan_type
        entity.cancel_at_period_end = cancel_at_period_end
        entity.current_period_end = current_period_end
        self._subscription_repo.save(entity)

    def _revert_to_free(self, subscription_data: SubscriptionEventData) -> None:
        customer_id = subscription_data.customer
        if not customer_id:
            return

        entity = self._subscription_repo.get_by_stripe_customer_id(customer_id)
        if entity is None:
            return

        entity.plan = PlanType.FREE
        entity.stripe_subscription_id = None
        entity.stripe_status = "canceled"
        entity.cancel_at_period_end = False
        entity.current_period_end = None
        self._subscription_repo.save(entity)
