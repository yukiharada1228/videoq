from django.urls import path

from .views import ProtectedMediaView

app_name = "app"

urlpatterns = [
    path("media/<path:path>", ProtectedMediaView.as_view(), name="protected_media"),
]
