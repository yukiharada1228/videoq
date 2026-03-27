from app.domain.billing.ports import BillingGateway, SubscriptionRepository
from app.use_cases.billing.dtos import BillingPortalDTO
from app.use_cases.billing.exceptions import BillingNotEnabled, NoStripeCustomer


class CreateBillingPortalUseCase:
    def __init__(
        self,
        subscription_repo: SubscriptionRepository,
        billing_gateway: BillingGateway,
        billing_enabled: bool,
    ):
        self._subscription_repo = subscription_repo
        self._billing_gateway = billing_gateway
        self._billing_enabled = billing_enabled

    def execute(self, user_id: int, return_url: str) -> BillingPortalDTO:
        if not self._billing_enabled:
            raise BillingNotEnabled("Billing is not enabled.")

        entity = self._subscription_repo.get_or_create(user_id)

        if not entity.stripe_customer_id:
            raise NoStripeCustomer("User does not have a Stripe customer ID.")

        portal = self._billing_gateway.create_billing_portal(
            customer_id=entity.stripe_customer_id,
            return_url=return_url,
        )

        return BillingPortalDTO(portal_url=portal.url)
