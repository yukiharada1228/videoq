class BillingError(Exception):
    pass


class StorageLimitExceeded(BillingError):
    pass


class ProcessingLimitExceeded(BillingError):
    pass


class AiAnswersLimitExceeded(BillingError):
    pass
