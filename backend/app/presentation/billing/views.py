import logging

from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from rest_framework import generics, status
from rest_framework.request import Request
from rest_framework.response import Response

from app.presentation.billing.serializers import (
    CreateBillingPortalSerializer,
    CreateCheckoutSessionSerializer,
    PlanSerializer,
    SubscriptionSerializer,
)
from app.presentation.common.mixins import (
    AuthenticatedViewMixin,
    DependencyResolverMixin,
    PublicViewMixin,
)
from app.presentation.common.responses import create_error_response
from app.use_cases.billing.exceptions import (
    BillingNotEnabled,
    InvalidPlan,
    NoStripeCustomer,
)

logger = logging.getLogger(__name__)


class PublicAPIView(DependencyResolverMixin, PublicViewMixin, generics.GenericAPIView):
    pass


class AuthenticatedAPIView(
    DependencyResolverMixin, AuthenticatedViewMixin, generics.GenericAPIView
):
    pass


class PlanListView(PublicAPIView):
    """Return a list of available subscription plans."""

    get_plans_use_case = None

    def get(self, request: Request):
        use_case = self.resolve_dependency(self.get_plans_use_case)
        plans = use_case.execute()
        return Response(PlanSerializer(plans, many=True).data)


class CurrentSubscriptionView(AuthenticatedAPIView):
    """Return the current user's subscription details."""

    get_subscription_use_case = None

    def get(self, request: Request):
        use_case = self.resolve_dependency(self.get_subscription_use_case)
        dto = use_case.execute(user_id=request.user.id)
        return Response(SubscriptionSerializer(dto).data)


class CreateCheckoutSessionView(AuthenticatedAPIView):
    """Create a Stripe checkout session for a subscription plan."""

    create_checkout_session_use_case = None

    def post(self, request: Request):
        serializer = CreateCheckoutSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        use_case = self.resolve_dependency(self.create_checkout_session_use_case)
        try:
            dto = use_case.execute(
                user_id=request.user.id,
                plan=d["plan"],
                success_url=d["success_url"],
                cancel_url=d["cancel_url"],
                currency=d["currency"],
            )
        except BillingNotEnabled:
            return create_error_response(
                "Billing is not enabled.",
                status.HTTP_400_BAD_REQUEST,
                code="BILLING_NOT_ENABLED",
            )
        except InvalidPlan as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception("Unexpected error creating checkout session: %s", e)
            return create_error_response(
                "Failed to create checkout session.",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if dto.upgraded:
            return Response({"upgraded": True})
        return Response({"checkout_url": dto.checkout_url})


class CreateBillingPortalView(AuthenticatedAPIView):
    """Create a Stripe billing portal session."""

    create_billing_portal_use_case = None

    def post(self, request: Request):
        serializer = CreateBillingPortalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        use_case = self.resolve_dependency(self.create_billing_portal_use_case)
        try:
            dto = use_case.execute(
                user_id=request.user.id,
                return_url=d["return_url"],
            )
        except BillingNotEnabled:
            return create_error_response(
                "Billing is not enabled.",
                status.HTTP_400_BAD_REQUEST,
                code="BILLING_NOT_ENABLED",
            )
        except NoStripeCustomer:
            return create_error_response(
                "No billing account found.",
                status.HTTP_400_BAD_REQUEST,
                code="NO_STRIPE_CUSTOMER",
            )
        except Exception as e:
            logger.exception("Unexpected error creating billing portal: %s", e)
            return create_error_response(
                "Failed to create billing portal.",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"portal_url": dto.portal_url})


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(View):
    """Handle Stripe webhook events.

    Uses a plain Django view (not DRF) to guarantee access to the raw
    request body, which is required for Stripe signature verification.
    """

    def post(self, request):
        import stripe
        from app.dependencies.billing import get_handle_webhook_use_case

        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        payload = request.body

        use_case = get_handle_webhook_use_case()
        try:
            use_case.execute(payload=payload, sig_header=sig_header)
        except stripe.error.SignatureVerificationError:
            logger.warning("Webhook signature verification failed")
            return JsonResponse({"error": {"code": "INVALID_SIGNATURE"}}, status=400)
        except Exception:
            logger.exception("Unexpected webhook error")
            return JsonResponse({"error": {"code": "WEBHOOK_ERROR"}}, status=500)

        return JsonResponse({"message": "Webhook processed."})


stripe_webhook_view = StripeWebhookView.as_view()
