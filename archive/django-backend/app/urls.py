from django.urls import path

from app.dependencies import media as media_dependencies
from app.presentation.media.views import ProtectedMediaView

app_name = "app"

urlpatterns = [
    path(
        "media/<path:path>",
        ProtectedMediaView.as_view(
            resolve_protected_media_use_case=(
                media_dependencies.get_resolve_protected_media_use_case
            )
        ),
        name="protected_media",
    ),
]
