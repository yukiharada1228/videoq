from django.urls import path

from app.dependencies import billing as billing_dependencies

from .views import (
    CreateBillingPortalView,
    CreateCheckoutSessionView,
    CurrentSubscriptionView,
    PlanListView,
    stripe_webhook_view,
)

urlpatterns = [
    path(
        "plans/",
        PlanListView.as_view(
            get_plans_use_case=billing_dependencies.get_plans_use_case,
        ),
        name="billing-plans",
    ),
    path(
        "subscription/",
        CurrentSubscriptionView.as_view(
            get_subscription_use_case=billing_dependencies.get_subscription_use_case,
        ),
        name="billing-subscription",
    ),
    path(
        "checkout/",
        CreateCheckoutSessionView.as_view(
            create_checkout_session_use_case=billing_dependencies.get_create_checkout_session_use_case,
        ),
        name="billing-checkout",
    ),
    path(
        "portal/",
        CreateBillingPortalView.as_view(
            create_billing_portal_use_case=billing_dependencies.get_create_billing_portal_use_case,
        ),
        name="billing-portal",
    ),
    path(
        "webhook/",
        stripe_webhook_view,
        name="billing-webhook",
    ),
]
