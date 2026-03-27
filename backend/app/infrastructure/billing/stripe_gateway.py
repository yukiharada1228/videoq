import os

from app.domain.billing.ports import (
    BillingGateway,
    SessionResult,
    SubscriptionEventData,
    WebhookEvent,
)


class StripeBillingGateway(BillingGateway):
    def __init__(self):
        try:
            import stripe as _stripe
            _stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
            self._stripe = _stripe
        except ImportError:
            self._stripe = None

    def _get_stripe(self):
        if self._stripe is None:
            raise RuntimeError(
                "The 'stripe' package is not installed. "
                "Install it with: pip install stripe"
            )
        return self._stripe

    def get_or_create_customer(self, user_id: int, email: str, username: str) -> str:
        stripe = self._get_stripe()
        customer = stripe.Customer.create(
            email=email,
            name=username,
            metadata={"user_id": str(user_id)},
        )
        return customer.id

    def create_checkout_session(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        user_id: int,
        plan: str,
    ) -> SessionResult:
        stripe = self._get_stripe()
        result = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": str(user_id), "plan": plan},
        )
        return SessionResult(url=result.url)

    def update_subscription(self, subscription_id: str, price_id: str) -> None:
        stripe = self._get_stripe()
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
        current_item = stripe_sub.items.data[0]
        stripe.Subscription.modify(
            subscription_id,
            items=[{"id": current_item.id, "price": price_id}],
            proration_behavior="create_prorations",
        )

    def create_billing_portal(self, customer_id: str, return_url: str) -> SessionResult:
        stripe = self._get_stripe()
        result = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
        return SessionResult(url=result.url)

    def verify_webhook(self, payload: bytes, sig_header: str, secret: str) -> WebhookEvent:
        stripe = self._get_stripe()
        event = stripe.Webhook.construct_event(payload, sig_header, secret)
        subscription = event.data.object
        items = subscription.items.data if getattr(subscription, "items", None) else []
        price_id = items[0].price.id if items else None
        return WebhookEvent(
            type=event.type,
            data_object=SubscriptionEventData(
                id=getattr(subscription, "id", ""),
                customer=getattr(subscription, "customer", ""),
                status=getattr(subscription, "status", ""),
                cancel_at_period_end=getattr(subscription, "cancel_at_period_end", False),
                current_period_end=getattr(subscription, "current_period_end", None),
                price_id=price_id,
            ),
        )

    def cancel_subscription(self, subscription_id: str) -> None:
        stripe = self._get_stripe()
        stripe.Subscription.cancel(subscription_id)
