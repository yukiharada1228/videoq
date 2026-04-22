from django.urls import path

from .views import EvaluationLogsView, EvaluationSummaryView

urlpatterns = [
    path(
        "summary/",
        EvaluationSummaryView.as_view(),
        name="evaluation-summary",
    ),
    path(
        "logs/",
        EvaluationLogsView.as_view(),
        name="evaluation-logs",
    ),
]
