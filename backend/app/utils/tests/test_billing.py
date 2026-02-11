"""
Tests for billing utility functions
"""

import datetime as dt
from unittest.mock import MagicMock

from django.test import TestCase
from django.utils import timezone

from app.utils.billing import get_current_period_start


class GetCurrentPeriodStartTests(TestCase):
    """Tests for get_current_period_start function"""

    def test_paid_user_returns_one_month_before_period_end(self):
        """Paid user: period start = current_period_end - 1 month"""
        sub = MagicMock()
        sub.current_period_end = dt.datetime(
            2026, 3, 15, 12, 0, 0, tzinfo=dt.timezone.utc
        )

        result = get_current_period_start(sub)

        self.assertEqual(result.year, 2026)
        self.assertEqual(result.month, 2)
        self.assertEqual(result.day, 15)

    def test_free_user_null_period_end_returns_first_of_month(self):
        """Free user (no period end): period start = 1st of current month"""
        sub = MagicMock()
        sub.current_period_end = None

        result = get_current_period_start(sub)

        now = timezone.now()
        self.assertEqual(result.day, 1)
        self.assertEqual(result.month, now.month)
        self.assertEqual(result.year, now.year)
        self.assertEqual(result.hour, 0)
        self.assertEqual(result.minute, 0)
        self.assertEqual(result.second, 0)

    def test_no_subscription_returns_first_of_month(self):
        """No subscription at all: period start = 1st of current month"""
        result = get_current_period_start(None)

        now = timezone.now()
        self.assertEqual(result.day, 1)
        self.assertEqual(result.month, now.month)
        self.assertEqual(result.year, now.year)

    def test_paid_user_handles_year_boundary(self):
        """Period end in January: period start should be in December of previous year"""
        sub = MagicMock()
        sub.current_period_end = dt.datetime(
            2026, 1, 10, 0, 0, 0, tzinfo=dt.timezone.utc
        )

        result = get_current_period_start(sub)

        self.assertEqual(result.year, 2025)
        self.assertEqual(result.month, 12)
        self.assertEqual(result.day, 10)
