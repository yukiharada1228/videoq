from datetime import datetime

from dateutil.relativedelta import relativedelta
from django.utils import timezone


def get_current_period_start(subscription):
    """
    Calculate the start of the current billing period.

    For paid users: 1 month before current_period_end.
    For free users (current_period_end=NULL): 1st day of the current calendar month.
    """
    if subscription and subscription.current_period_end:
        return subscription.current_period_end - relativedelta(months=1)

    now = timezone.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
