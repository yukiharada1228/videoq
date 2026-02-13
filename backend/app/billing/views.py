import logging

import stripe
from django.conf import settings
from django.http import JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework import generics, status
from rest_framework.response import Response

from app.common.responses import create_error_response
from app.models.subscription import Subscription
from app.utils.mixins import AuthenticatedViewMixin, PublicViewMixin

from .serializers import (
    CreateBillingPortalSerializer,
    CreateCheckoutSessionSerializer,
    PlanSerializer,
    SubscriptionSerializer,
    get_plans_data,
)
from .services import (
    create_billing_portal_session,
    create_checkout_session,
    handle_subscription_event,
)

logger = logging.getLogger(__name__)


class PlanListView(PublicViewMixin, generics.GenericAPIView):
    """Return all available plans."""

    serializer_class = PlanSerializer

    def get(self, request):
        if not settings.BILLING_ENABLED:
            return Response([])
        plans = get_plans_data()
        serializer = PlanSerializer(plans, many=True)
        return Response(serializer.data)


class CurrentSubscriptionView(AuthenticatedViewMixin, generics.GenericAPIView):
    """Return the current user's subscription."""

    serializer_class = SubscriptionSerializer

    def get(self, request):
        sub, _ = Subscription.objects.get_or_create(user=request.user)
        serializer = SubscriptionSerializer(sub)
        return Response(serializer.data)


class CreateCheckoutSessionView(AuthenticatedViewMixin, generics.GenericAPIView):
    """Create a Stripe Checkout Session."""

    serializer_class = CreateCheckoutSessionSerializer

    def post(self, request):
        if not settings.BILLING_ENABLED:
            return create_error_response(
                message="Billing is not enabled.",
                status_code=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            session = create_checkout_session(
                user=request.user,
                plan=serializer.validated_data["plan"],
                success_url=serializer.validated_data["success_url"],
                cancel_url=serializer.validated_data["cancel_url"],
            )
            return Response({"checkout_url": session.url})
        except ValueError as e:
            return create_error_response(
                message=str(e),
                status_code=status.HTTP_400_BAD_REQUEST,
            )


class CreateBillingPortalView(AuthenticatedViewMixin, generics.GenericAPIView):
    """Create a Stripe Billing Portal Session."""

    serializer_class = CreateBillingPortalSerializer

    def post(self, request):
        if not settings.BILLING_ENABLED:
            return create_error_response(
                message="Billing is not enabled.",
                status_code=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            session = create_billing_portal_session(
                user=request.user,
                return_url=serializer.validated_data["return_url"],
            )
            return Response({"portal_url": session.url})
        except ValueError as e:
            return create_error_response(
                message=str(e),
                status_code=status.HTTP_400_BAD_REQUEST,
            )


class StripeWebhookView(View):
    """Receive Stripe webhook events.

    Uses a plain Django view (not DRF) to guarantee access to the raw
    request body, which is required for Stripe signature verification.
    """

    def post(self, request):
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            logger.warning("Invalid webhook payload")
            return JsonResponse({"error": "Invalid payload"}, status=400)
        except stripe.SignatureVerificationError:
            logger.warning("Invalid webhook signature")
            return JsonResponse({"error": "Invalid signature"}, status=400)

        try:
            handle_subscription_event(event)
        except Exception:
            logger.exception("Error handling webhook event %s", event["type"])
            return JsonResponse({"error": "Webhook handler error"}, status=500)

        return JsonResponse({"status": "ok"})


stripe_webhook_view = csrf_exempt(StripeWebhookView.as_view())
