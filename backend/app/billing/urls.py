from django.urls import path

from . import views

urlpatterns = [
    path("plans/", views.PlanListView.as_view(), name="billing-plans"),
    path(
        "subscription/",
        views.CurrentSubscriptionView.as_view(),
        name="billing-subscription",
    ),
    path(
        "checkout/",
        views.CreateCheckoutSessionView.as_view(),
        name="billing-checkout",
    ),
    path(
        "portal/",
        views.CreateBillingPortalView.as_view(),
        name="billing-portal",
    ),
    path("webhook/", views.stripe_webhook_view, name="billing-webhook"),
]
