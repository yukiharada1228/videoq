"""Unit tests for StripeBillingGateway — stripe-python v15 compatibility.

stripe v15 dropped dict inheritance from StripeObject, so bracket-style
access (obj["key"]) no longer works.  These tests enforce that the gateway
uses attribute (dot) access only, by providing a stub StripeObject that
intentionally raises TypeError on __getitem__.
"""
from unittest import TestCase
from unittest.mock import MagicMock


# ---------------------------------------------------------------------------
# Helpers — simulate v15 StripeObject (no dict inheritance)
# ---------------------------------------------------------------------------

class _V15StripeObject:
    """Minimal stub that mimics stripe v15 StripeObject behaviour.

    Attribute access works; subscript access raises TypeError, just like
    the real v15 object would for code that still uses bracket notation.
    to_dict() returns a plain dict (as the real v15 API provides).
    """

    def __init__(self, **attrs):
        for k, v in attrs.items():
            object.__setattr__(self, k, v)

    def __getitem__(self, key):
        raise TypeError(
            f"StripeObject does not support item access in stripe v15. "
            f"Use attribute access (obj.{key}) instead."
        )

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}


def _make_subscription_obj(subscription_id="sub_test", item_id="si_test"):
    """Build a v15-style Subscription object with nested items."""
    item = _V15StripeObject(id=item_id)
    items_list = _V15StripeObject(data=[item])
    return _V15StripeObject(
        id=subscription_id,
        items=items_list,
    )


# ---------------------------------------------------------------------------
# Tests: update_subscription
# ---------------------------------------------------------------------------

class UpdateSubscriptionV15Tests(TestCase):
    """update_subscription must use dot-notation (not bracket access) on StripeObject."""

    def _make_gateway(self):
        from app.infrastructure.billing.stripe_gateway import StripeBillingGateway
        gw = StripeBillingGateway.__new__(StripeBillingGateway)
        gw._stripe = MagicMock()
        return gw

    def test_uses_dot_notation_to_access_items(self):
        """Gateway must read current_item via .items.data[0], not ["items"]["data"][0]."""
        gw = self._make_gateway()
        stripe_sub = _make_subscription_obj(subscription_id="sub_abc", item_id="si_xyz")
        gw._stripe.Subscription.retrieve.return_value = stripe_sub

        # Should NOT raise TypeError (which would happen with bracket access)
        gw.update_subscription("sub_abc", "price_new")

        gw._stripe.Subscription.modify.assert_called_once_with(
            "sub_abc",
            items=[{"id": "si_xyz", "price": "price_new"}],
            proration_behavior="create_prorations",
        )

    def test_item_id_from_dot_notation(self):
        """The item id passed to modify must come from current_item.id, not current_item["id"]."""
        gw = self._make_gateway()
        stripe_sub = _make_subscription_obj(item_id="si_correct")
        gw._stripe.Subscription.retrieve.return_value = stripe_sub

        gw.update_subscription("sub_x", "price_y")

        call_kwargs = gw._stripe.Subscription.modify.call_args
        items_arg = call_kwargs[1]["items"]
        self.assertEqual(items_arg[0]["id"], "si_correct")


# ---------------------------------------------------------------------------
# Tests: retrieve_subscription
# ---------------------------------------------------------------------------

class RetrieveSubscriptionV15Tests(TestCase):
    """retrieve_subscription must return a plain dict, not a StripeObject."""

    def _make_gateway(self):
        from app.infrastructure.billing.stripe_gateway import StripeBillingGateway
        gw = StripeBillingGateway.__new__(StripeBillingGateway)
        gw._stripe = MagicMock()
        return gw

    def test_returns_plain_dict(self):
        """retrieve_subscription must convert the StripeObject to a plain dict via to_dict()."""
        gw = self._make_gateway()
        stripe_obj = _V15StripeObject(id="sub_test", status="active")
        gw._stripe.Subscription.retrieve.return_value = stripe_obj

        result = gw.retrieve_subscription("sub_test")

        self.assertIsInstance(result, dict,
            "retrieve_subscription must return a plain dict, not a StripeObject")

    def test_dict_contains_expected_fields(self):
        """The returned dict must preserve id and status from the StripeObject."""
        gw = self._make_gateway()
        stripe_obj = _V15StripeObject(id="sub_test", status="active")
        gw._stripe.Subscription.retrieve.return_value = stripe_obj

        result = gw.retrieve_subscription("sub_test")

        self.assertIsInstance(result, dict)
        self.assertEqual(result["id"], "sub_test")
        self.assertEqual(result["status"], "active")


# ---------------------------------------------------------------------------
# Tests: verify_webhook
# ---------------------------------------------------------------------------

class VerifyWebhookV15Tests(TestCase):
    """verify_webhook must return a WebhookEvent domain DTO, not a raw StripeObject."""

    def _make_gateway(self):
        from app.infrastructure.billing.stripe_gateway import StripeBillingGateway
        gw = StripeBillingGateway.__new__(StripeBillingGateway)
        gw._stripe = MagicMock()
        return gw

    def _make_event_obj(self, event_type, **sub_attrs):
        data_obj = _V15StripeObject(**sub_attrs)
        data = _V15StripeObject(object=data_obj)
        return _V15StripeObject(type=event_type, data=data)

    def test_returns_webhook_event_dto(self):
        """verify_webhook must return a WebhookEvent, not a raw StripeObject or dict."""
        from app.domain.billing.ports import WebhookEvent
        gw = self._make_gateway()
        event_obj = self._make_event_obj("customer.subscription.created", id="sub_1")
        gw._stripe.Webhook.construct_event.return_value = event_obj

        result = gw.verify_webhook(b"payload", "sig", "whsec_test")

        self.assertIsInstance(result, WebhookEvent)

    def test_event_type_extracted_via_dot_notation(self):
        """WebhookEvent.type must come from event.type (dot notation), not event['type']."""
        gw = self._make_gateway()
        event_obj = self._make_event_obj("customer.subscription.updated", id="sub_2")
        gw._stripe.Webhook.construct_event.return_value = event_obj

        result = gw.verify_webhook(b"payload", "sig", "whsec_test")

        self.assertEqual(result.type, "customer.subscription.updated")

    def test_data_object_is_plain_dict(self):
        """WebhookEvent.data_object must be a plain dict for use-case access."""
        gw = self._make_gateway()
        event_obj = self._make_event_obj("customer.subscription.deleted",
                                         id="sub_3", customer="cus_test")
        gw._stripe.Webhook.construct_event.return_value = event_obj

        result = gw.verify_webhook(b"payload", "sig", "whsec_test")

        self.assertIsInstance(result.data_object, dict)
        self.assertEqual(result.data_object["id"], "sub_3")
        self.assertEqual(result.data_object["customer"], "cus_test")
