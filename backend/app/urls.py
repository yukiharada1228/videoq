from django.urls import path

from .views import protected_media

app_name = "app"

urlpatterns = [
    path("media/<path:path>", protected_media),
]
