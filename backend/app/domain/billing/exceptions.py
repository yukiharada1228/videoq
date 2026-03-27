class BillingError(Exception):
    pass


class StorageLimitExceeded(BillingError):
    pass


class ProcessingLimitExceeded(BillingError):
    pass


class AiAnswersLimitExceeded(BillingError):
    pass


class OverQuotaError(BillingError):
    """Raised when a feature is blocked because the account is over storage quota."""
    pass
