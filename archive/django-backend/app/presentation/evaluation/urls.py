from django.urls import path

from .views import EvaluationLogsView, EvaluationSummaryView

urlpatterns = [
    path(
        "groups/<int:group_id>/summary/",
        EvaluationSummaryView.as_view(),
        name="evaluation-group-summary",
    ),
    path(
        "groups/<int:group_id>/logs/",
        EvaluationLogsView.as_view(),
        name="evaluation-group-logs",
    ),
]
