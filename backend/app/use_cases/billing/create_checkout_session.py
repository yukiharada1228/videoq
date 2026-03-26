from app.domain.billing.entities import PlanType
from app.domain.billing.ports import BillingGateway, SubscriptionRepository
from app.use_cases.billing.dtos import CheckoutSessionDTO
from app.use_cases.billing.exceptions import (
    AlreadySubscribed,
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

        # Ensure Stripe customer exists
        customer_id = entity.stripe_customer_id
        if not customer_id:
            customer_id = self._billing_gateway.get_or_create_customer(
                user_id=user_id,
                email=user.email,
                username=user.username,
            )
            entity = self._subscription_repo.create_stripe_customer(user_id, customer_id)

        # If already has active paid subscription, update the plan in place
        if entity.stripe_subscription_id and entity.is_stripe_active and entity.plan != PlanType.FREE:
            self._billing_gateway.update_subscription(entity.stripe_subscription_id, price_id)
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
            # Stale customer ID — recreate if the error is customer-related
            if "No such customer" in str(e):
                customer_id = self._billing_gateway.get_or_create_customer(
                    user_id=user_id,
                    email=user.email,
                    username=user.username,
                )
                self._subscription_repo.create_stripe_customer(user_id, customer_id)
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
