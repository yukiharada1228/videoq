from app.domain.billing.exceptions import (  # noqa: F401
    AiAnswersLimitExceeded,
    ProcessingLimitExceeded,
    StorageLimitExceeded,
)


class BillingNotEnabled(Exception):
    pass


class AlreadySubscribed(Exception):
    pass


class NoStripeCustomer(Exception):
    pass


class InvalidPlan(Exception):
    pass
