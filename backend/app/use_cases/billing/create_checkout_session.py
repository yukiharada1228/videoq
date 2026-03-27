from app.domain.billing.entities import PlanType
from app.domain.billing.ports import BillingGateway, SubscriptionRepository
from app.use_cases.billing.dtos import CheckoutSessionDTO
from app.use_cases.billing.exceptions import (
    BillingNotEnabled,
    InvalidPlan,
)


class CreateCheckoutSessionUseCase:
    def __init__(
        self,
        subscription_repo: SubscriptionRepository,
        billing_gateway: BillingGateway,
        billing_enabled: bool,
        price_map: dict,
        user_repo,
    ):
        self._subscription_repo = subscription_repo
        self._billing_gateway = billing_gateway
        self._billing_enabled = billing_enabled
        self._price_map = price_map  # {PlanType.LITE: {"jpy": "price_xxx", "usd": "price_yyy"}, ...}
        self._user_repo = user_repo

    def execute(
        self,
        user_id: int,
        plan: str,
        success_url: str,
        cancel_url: str,
        currency: str = "jpy",
    ) -> CheckoutSessionDTO:
        if not self._billing_enabled:
            raise BillingNotEnabled("Billing is not enabled.")

        # Validate plan — only paid, non-enterprise plans can be checked out
        try:
            plan_type = PlanType(plan)
        except ValueError:
            raise InvalidPlan(f"Invalid plan: {plan}")

        if plan_type in (PlanType.FREE, PlanType.ENTERPRISE):
            raise InvalidPlan(f"Plan {plan} cannot be purchased via checkout.")

        currency = currency.lower()
        currency_map = self._price_map.get(plan_type)
        if not currency_map:
            raise InvalidPlan(f"No price configured for plan: {plan}")
        if currency not in currency_map:
            raise InvalidPlan(f"Unsupported currency: {currency}")
        price_id = currency_map[currency]
        if not price_id:
            raise InvalidPlan(f"No price configured for plan: {plan} / currency: {currency}")

        # Get or create subscription record
        entity = self._subscription_repo.get_or_create(user_id)

        # Get user info for Stripe
        user = self._user_repo.get_by_id(user_id)

        # Ensure Stripe customer exists — repo uses select_for_update to prevent
        # duplicate creation under concurrent requests.
        customer_id, entity = self._subscription_repo.get_or_create_stripe_customer(
            user_id,
            lambda: self._billing_gateway.get_or_create_customer(
                user_id=user_id,
                email=user.email,
                username=user.username,
            ),
        )

        # If already has active (or pending-cancellation) paid subscription, update the plan in place
        if entity.stripe_subscription_id and (entity.is_stripe_active or entity.is_pending_cancellation) and entity.plan != PlanType.FREE:
            try:
                self._billing_gateway.update_subscription(entity.stripe_subscription_id, price_id)
            except Exception as e:
                # Stripe may reject updates for subscriptions that were already canceled
                # even if our local record still looks active.
                if "canceled subscription" not in str(e).lower():
                    raise
                entity.plan = PlanType.FREE
                entity.stripe_subscription_id = None
                entity.stripe_status = "canceled"
                entity.cancel_at_period_end = False
                entity.current_period_end = None
                entity = self._subscription_repo.save(entity)
            else:
                return CheckoutSessionDTO(checkout_url="", upgraded=True)

        try:
            session = self._billing_gateway.create_checkout_session(
                customer_id=customer_id,
                price_id=price_id,
                success_url=success_url,
                cancel_url=cancel_url,
                user_id=user_id,
                plan=plan,
            )
        except Exception as e:
            # Stale customer ID — recreate if the error is customer-related.
            # Use force_recreate=True so the stale ID is discarded and a new customer
            # is created within a single atomic row lock, eliminating the race window
            # that existed when clear_stripe_customer and get_or_create_stripe_customer
            # were called as separate unlocked + locked steps.
            if "No such customer" in str(e):
                customer_id, _ = self._subscription_repo.get_or_create_stripe_customer(
                    user_id,
                    lambda: self._billing_gateway.get_or_create_customer(
                        user_id=user_id,
                        email=user.email,
                        username=user.username,
                    ),
                    force_recreate=True,
                )
                session = self._billing_gateway.create_checkout_session(
                    customer_id=customer_id,
                    price_id=price_id,
                    success_url=success_url,
                    cancel_url=cancel_url,
                    user_id=user_id,
                    plan=plan,
                )
            else:
                raise

        return CheckoutSessionDTO(checkout_url=session.url)
