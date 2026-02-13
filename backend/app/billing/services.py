import logging

import stripe
from django.conf import settings

from app.models.subscription import PlanType, Subscription

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

STRIPE_PRICE_MAP = {
    PlanType.LITE: settings.STRIPE_LITE_PRICE_ID,
    PlanType.STANDARD: settings.STRIPE_STANDARD_PRICE_ID,
}

PRICE_TO_PLAN_MAP = {v: k for k, v in STRIPE_PRICE_MAP.items() if v}


def get_or_create_stripe_customer(user):
    """Get or create a Stripe Customer for the given user."""
    sub, _ = Subscription.objects.get_or_create(user=user)

    if sub.stripe_customer_id:
        return sub.stripe_customer_id

    customer = stripe.Customer.create(
        email=user.email,
        name=user.username,
        metadata={"user_id": str(user.pk)},
    )
    sub.stripe_customer_id = customer.id
    sub.save(update_fields=["stripe_customer_id"])
    return customer.id


def create_checkout_session(user, plan, success_url, cancel_url):
    """Create a Stripe Checkout Session for the given plan.

    If the user already has an active subscription, update it in-place
    instead of creating a second subscription via Checkout.
    """
    price_id = STRIPE_PRICE_MAP.get(plan)
    if not price_id:
        raise ValueError(f"No Stripe price configured for plan: {plan}")

    customer_id = get_or_create_stripe_customer(user)

    # If user already has an active Stripe subscription, update it directly
    sub = Subscription.objects.filter(user=user).first()
    if sub and sub.stripe_subscription_id and sub.stripe_status in (
        "active",
        "trialing",
    ):
        stripe_sub = stripe.Subscription.retrieve(sub.stripe_subscription_id)
        current_item = stripe_sub["items"]["data"][0]

        # Skip if already on the requested price
        if current_item["price"]["id"] == price_id:
            raise ValueError("Already subscribed to this plan")

        stripe.Subscription.modify(
            sub.stripe_subscription_id,
            items=[
                {
                    "id": current_item["id"],
                    "price": price_id,
                }
            ],
            proration_behavior="create_prorations",
        )
        # Return a pseudo-object with redirect to success_url
        # (webhook will sync the updated subscription)
        return _SuccessRedirect(success_url)

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": str(user.pk), "plan": plan},
    )
    return session


class _SuccessRedirect:
    """Minimal object that mimics Checkout Session's `.url` attribute."""

    def __init__(self, url):
        self.url = url


def create_billing_portal_session(user, return_url):
    """Create a Stripe Billing Portal Session."""
    sub = Subscription.objects.filter(user=user).first()
    if not sub or not sub.stripe_customer_id:
        raise ValueError("No Stripe customer found for this user")

    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=return_url,
    )
    return session


def handle_subscription_event(event):
    """Process a Stripe webhook event related to subscriptions."""
    event_type = event["type"]
    data = event["data"]["object"]

    if event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        _sync_subscription(data)
    elif event_type == "checkout.session.completed":
        # Subscription is synced via subscription events
        logger.info(f"Checkout session completed: {data.get('id')}")


def _sync_subscription(stripe_sub):
    """Sync a Stripe Subscription object to the local database."""
    customer_id = stripe_sub.get("customer")
    if not customer_id:
        logger.warning("No customer ID in subscription event")
        return

    try:
        sub = Subscription.objects.get(stripe_customer_id=customer_id)
    except Subscription.DoesNotExist:
        logger.warning(f"No local subscription for customer {customer_id}")
        return

    sub.stripe_subscription_id = stripe_sub.get("id")
    sub.stripe_status = stripe_sub.get("status", "")
    sub.cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)

    current_period_end = stripe_sub.get("current_period_end")
    if current_period_end:
        from datetime import datetime, timezone

        sub.current_period_end = datetime.fromtimestamp(
            current_period_end, tz=timezone.utc
        )

    # Determine plan from price
    items = stripe_sub.get("items", {}).get("data", [])
    if items:
        price_id = items[0].get("price", {}).get("id")
        plan = PRICE_TO_PLAN_MAP.get(price_id, PlanType.FREE)
    else:
        plan = PlanType.FREE

    # If subscription is canceled/unpaid, revert to free
    if stripe_sub.get("status") in ("canceled", "unpaid"):
        plan = PlanType.FREE

    sub.plan = plan
    sub.save(
        update_fields=[
            "stripe_subscription_id",
            "stripe_status",
            "cancel_at_period_end",
            "current_period_end",
            "plan",
            "updated_at",
        ]
    )

    logger.info(
        f"Synced subscription for user {sub.user.username}: "
        f"plan={plan}, status={stripe_sub.get('status')}"
    )
