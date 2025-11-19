from app.media.views import ProtectedMediaView
from django.urls import path

app_name = "app"

urlpatterns = [
    path("media/<path:path>", ProtectedMediaView.as_view(), name="protected_media"),
]
