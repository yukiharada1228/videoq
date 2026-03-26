"""Tests for billing views."""

from unittest.mock import MagicMock, patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from app.use_cases.billing.dtos import (
    BillingPortalDTO,
    CheckoutSessionDTO,
    PlanDTO,
    SubscriptionDTO,
)
from app.use_cases.billing.exceptions import (
    BillingNotEnabled,
    NoStripeCustomer,
)


def _make_plan_dto(**kwargs) -> PlanDTO:
    defaults = {
        "name": "Free",
        "plan_id": "free",
        "prices": {"jpy": 0, "usd": 0},
        "storage_gb": 1.0,
        "processing_minutes": 10,
        "ai_answers": 500,
        "is_contact_required": False,
    }
    defaults.update(kwargs)
    return PlanDTO(**defaults)


def _make_subscription_dto(**kwargs) -> SubscriptionDTO:
    defaults = {
        "plan": "free",
        "stripe_status": "",
        "current_period_end": None,
        "cancel_at_period_end": False,
        "is_active": True,
        "used_storage_bytes": 0,
        "used_processing_seconds": 0,
        "used_ai_answers": 0,
        "storage_limit_bytes": 1073741824,
        "processing_limit_seconds": 600,
        "ai_answers_limit": 500,
    }
    defaults.update(kwargs)
    return SubscriptionDTO(**defaults)


@override_settings(
    BILLING_ENABLED=False,
    STRIPE_SECRET_KEY="",
    STRIPE_WEBHOOK_SECRET="",
    STRIPE_LITE_PRICE_ID_JPY="price_lite_jpy",
    STRIPE_LITE_PRICE_ID_USD="price_lite_usd",
    STRIPE_STANDARD_PRICE_ID_JPY="price_standard_jpy",
    STRIPE_STANDARD_PRICE_ID_USD="price_standard_usd",
)
class PlanListViewTests(APITestCase):
    def test_plan_list_returns_200(self):
        url = reverse("billing-plans")
        mock_use_case = MagicMock()
        mock_use_case.execute.return_value = [_make_plan_dto()]
        with patch(
            "app.presentation.billing.views.PlanListView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["plan_id"], "free")

    def test_plan_list_returns_correct_fields(self):
        url = reverse("billing-plans")
        mock_use_case = MagicMock()
        mock_use_case.execute.return_value = [
            _make_plan_dto(plan_id="lite", name="Lite", prices={"jpy": 980, "usd": 699}),
        ]
        with patch(
            "app.presentation.billing.views.PlanListView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["prices"]["jpy"], 980)
        self.assertEqual(response.data[0]["prices"]["usd"], 699)


@override_settings(
    BILLING_ENABLED=False,
    STRIPE_SECRET_KEY="",
    STRIPE_WEBHOOK_SECRET="",
    STRIPE_LITE_PRICE_ID_JPY="price_lite_jpy",
    STRIPE_LITE_PRICE_ID_USD="price_lite_usd",
    STRIPE_STANDARD_PRICE_ID_JPY="price_standard_jpy",
    STRIPE_STANDARD_PRICE_ID_USD="price_standard_usd",
)
class CurrentSubscriptionViewTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="testpass"
        )
        self.client.force_authenticate(user=self.user)

    def test_subscription_view_returns_200(self):
        url = reverse("billing-subscription")
        mock_use_case = MagicMock()
        mock_use_case.execute.return_value = _make_subscription_dto()
        with patch(
            "app.presentation.billing.views.CurrentSubscriptionView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["plan"], "free")
        self.assertTrue(response.data["is_active"])

    def test_subscription_view_requires_auth(self):
        self.client.force_authenticate(user=None)
        url = reverse("billing-subscription")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(
    BILLING_ENABLED=True,
    STRIPE_SECRET_KEY="sk_test_xxx",
    STRIPE_WEBHOOK_SECRET="whsec_test",
    STRIPE_LITE_PRICE_ID_JPY="price_lite_jpy",
    STRIPE_LITE_PRICE_ID_USD="price_lite_usd",
    STRIPE_STANDARD_PRICE_ID_JPY="price_standard_jpy",
    STRIPE_STANDARD_PRICE_ID_USD="price_standard_usd",
)
class CreateCheckoutSessionViewTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser2", email="test2@example.com", password="testpass"
        )
        self.client.force_authenticate(user=self.user)

    def test_checkout_returns_checkout_url(self):
        url = reverse("billing-checkout")
        mock_use_case = MagicMock()
        mock_use_case.execute.return_value = CheckoutSessionDTO(
            checkout_url="https://checkout.stripe.com/session_test"
        )
        with patch(
            "app.presentation.billing.views.CreateCheckoutSessionView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                {
                    "plan": "lite",
                    "currency": "jpy",
                    "success_url": "https://app.test/success",
                    "cancel_url": "https://app.test/cancel",
                },
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["checkout_url"],
            "https://checkout.stripe.com/session_test",
        )
        mock_use_case.execute.assert_called_once_with(
            user_id=self.user.id,
            plan="lite",
            success_url="https://app.test/success",
            cancel_url="https://app.test/cancel",
            currency="jpy",
        )

    def test_checkout_usd_creates_session_with_usd_currency(self):
        url = reverse("billing-checkout")
        mock_use_case = MagicMock()
        mock_use_case.execute.return_value = CheckoutSessionDTO(
            checkout_url="https://checkout.stripe.com/session_usd"
        )
        with patch(
            "app.presentation.billing.views.CreateCheckoutSessionView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                {
                    "plan": "lite",
                    "currency": "usd",
                    "success_url": "https://app.test/success",
                    "cancel_url": "https://app.test/cancel",
                },
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_use_case.execute.assert_called_once_with(
            user_id=self.user.id,
            plan="lite",
            success_url="https://app.test/success",
            cancel_url="https://app.test/cancel",
            currency="usd",
        )

    def test_checkout_invalid_currency_returns_400(self):
        url = reverse("billing-checkout")
        mock_use_case = MagicMock()
        with patch(
            "app.presentation.billing.views.CreateCheckoutSessionView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                {
                    "plan": "lite",
                    "currency": "eur",
                    "success_url": "https://app.test/success",
                    "cancel_url": "https://app.test/cancel",
                },
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_checkout_currency_defaults_to_jpy_when_omitted(self):
        url = reverse("billing-checkout")
        mock_use_case = MagicMock()
        mock_use_case.execute.return_value = CheckoutSessionDTO(
            checkout_url="https://checkout.stripe.com/session_default"
        )
        with patch(
            "app.presentation.billing.views.CreateCheckoutSessionView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                {
                    "plan": "lite",
                    "success_url": "https://app.test/success",
                    "cancel_url": "https://app.test/cancel",
                },
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_use_case.execute.assert_called_once_with(
            user_id=self.user.id,
            plan="lite",
            success_url="https://app.test/success",
            cancel_url="https://app.test/cancel",
            currency="jpy",
        )

    def test_checkout_billing_not_enabled_returns_400(self):
        url = reverse("billing-checkout")
        mock_use_case = MagicMock()
        mock_use_case.execute.side_effect = BillingNotEnabled("Billing is not enabled.")
        with patch(
            "app.presentation.billing.views.CreateCheckoutSessionView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                {
                    "plan": "lite",
                    "success_url": "https://app.test/success",
                    "cancel_url": "https://app.test/cancel",
                },
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "BILLING_NOT_ENABLED")

    def test_checkout_requires_auth(self):
        self.client.force_authenticate(user=None)
        url = reverse("billing-checkout")
        response = self.client.post(
            url,
            {
                "plan": "lite",
                "success_url": "https://app.test/success",
                "cancel_url": "https://app.test/cancel",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


@override_settings(
    BILLING_ENABLED=True,
    STRIPE_SECRET_KEY="sk_test_xxx",
    STRIPE_WEBHOOK_SECRET="whsec_test",
    STRIPE_LITE_PRICE_ID_JPY="price_lite_jpy",
    STRIPE_LITE_PRICE_ID_USD="price_lite_usd",
    STRIPE_STANDARD_PRICE_ID_JPY="price_standard_jpy",
    STRIPE_STANDARD_PRICE_ID_USD="price_standard_usd",
)
class CreateBillingPortalViewTests(APITestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_user(
            username="testuser3", email="test3@example.com", password="testpass"
        )
        self.client.force_authenticate(user=self.user)

    def test_portal_returns_portal_url(self):
        url = reverse("billing-portal")
        mock_use_case = MagicMock()
        mock_use_case.execute.return_value = BillingPortalDTO(
            portal_url="https://billing.stripe.com/portal_test"
        )
        with patch(
            "app.presentation.billing.views.CreateBillingPortalView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                {"return_url": "https://app.test/billing"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["portal_url"],
            "https://billing.stripe.com/portal_test",
        )

    def test_portal_no_stripe_customer_returns_400(self):
        url = reverse("billing-portal")
        mock_use_case = MagicMock()
        mock_use_case.execute.side_effect = NoStripeCustomer("No billing account found.")
        with patch(
            "app.presentation.billing.views.CreateBillingPortalView.resolve_dependency",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                {"return_url": "https://app.test/billing"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "NO_STRIPE_CUSTOMER")


@override_settings(
    BILLING_ENABLED=True,
    STRIPE_SECRET_KEY="sk_test_xxx",
    STRIPE_WEBHOOK_SECRET="whsec_test",
    STRIPE_LITE_PRICE_ID_JPY="price_lite_jpy",
    STRIPE_LITE_PRICE_ID_USD="price_lite_usd",
    STRIPE_STANDARD_PRICE_ID_JPY="price_standard_jpy",
    STRIPE_STANDARD_PRICE_ID_USD="price_standard_usd",
)
class StripeWebhookViewTests(APITestCase):
    def test_webhook_handles_valid_event(self):
        url = reverse("billing-webhook")
        mock_use_case = MagicMock()
        mock_use_case.execute.return_value = None
        with patch(
            "app.composition_root.billing.get_handle_webhook_use_case",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                data=b'{"type": "customer.subscription.created"}',
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="t=123,v1=abc",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("message", response.json())

    def test_webhook_invalid_signature_returns_400(self):
        url = reverse("billing-webhook")
        mock_use_case = MagicMock()
        mock_use_case.execute.side_effect = Exception("Invalid signature")
        with patch(
            "app.composition_root.billing.get_handle_webhook_use_case",
            return_value=mock_use_case,
        ):
            response = self.client.post(
                url,
                data=b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="invalid",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
