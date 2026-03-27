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


class DowngradeNotAllowed(Exception):
    def __init__(self, *, used_storage_bytes: int, target_limit_bytes: int):
        self.used_storage_bytes = used_storage_bytes
        self.target_limit_bytes = target_limit_bytes
        self.over_quota_bytes = max(0, used_storage_bytes - target_limit_bytes)
        super().__init__(
            "Current storage usage exceeds the target plan limit."
        )
