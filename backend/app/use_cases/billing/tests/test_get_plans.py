"""Unit tests for GetPlansUseCase."""

from unittest import TestCase

from app.use_cases.billing.get_plans import GetPlansUseCase


class GetPlansUseCaseTests(TestCase):
    def setUp(self):
        self.use_case = GetPlansUseCase()

    def test_returns_four_plans(self):
        plans = self.use_case.execute()
        self.assertEqual(len(plans), 4)

    def test_plan_ids_in_order(self):
        plans = self.use_case.execute()
        plan_ids = [p.plan_id for p in plans]
        self.assertEqual(plan_ids, ["free", "lite", "standard", "enterprise"])

    def test_free_plan_prices(self):
        plans = self.use_case.execute()
        free = next(p for p in plans if p.plan_id == "free")
        self.assertEqual(free.prices, {"jpy": 0, "usd": 0})

    def test_lite_plan_prices(self):
        plans = self.use_case.execute()
        lite = next(p for p in plans if p.plan_id == "lite")
        self.assertEqual(lite.prices, {"jpy": 980, "usd": 699})

    def test_standard_plan_prices(self):
        plans = self.use_case.execute()
        standard = next(p for p in plans if p.plan_id == "standard")
        self.assertEqual(standard.prices, {"jpy": 2980, "usd": 1999})

    def test_enterprise_plan_prices_are_none(self):
        plans = self.use_case.execute()
        enterprise = next(p for p in plans if p.plan_id == "enterprise")
        self.assertEqual(enterprise.prices, {"jpy": None, "usd": None})

    def test_enterprise_is_contact_required(self):
        plans = self.use_case.execute()
        enterprise = next(p for p in plans if p.plan_id == "enterprise")
        self.assertTrue(enterprise.is_contact_required)

    def test_non_enterprise_not_contact_required(self):
        plans = self.use_case.execute()
        for plan in plans:
            if plan.plan_id != "enterprise":
                self.assertFalse(plan.is_contact_required)

    def test_prices_has_jpy_and_usd_keys(self):
        plans = self.use_case.execute()
        for plan in plans:
            self.assertIn("jpy", plan.prices)
            self.assertIn("usd", plan.prices)

    def test_free_plan_storage_gb(self):
        plans = self.use_case.execute()
        free = next(p for p in plans if p.plan_id == "free")
        self.assertEqual(free.storage_gb, 1)

    def test_free_plan_processing_minutes(self):
        plans = self.use_case.execute()
        free = next(p for p in plans if p.plan_id == "free")
        self.assertEqual(free.processing_minutes, 10)

    def test_free_plan_ai_answers(self):
        plans = self.use_case.execute()
        free = next(p for p in plans if p.plan_id == "free")
        self.assertEqual(free.ai_answers, 500)
