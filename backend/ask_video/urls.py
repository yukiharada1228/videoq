"""
URL configuration for ask_video project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from app.common.authentication import CookieJWTAuthentication
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView
from rest_framework.permissions import AllowAny
from rest_framework.schemas import get_schema_view

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("app.auth.urls")),
    path("api/chat/", include("app.chat.urls")),
    path("api/videos/", include("app.video.urls")),
    path("", include("app.urls")),
    path(
        "api/schema/",
        get_schema_view(
            title="ask-video API Schema",
            description="API for all things …",
            version="1.0.0",
            public=False,
            permission_classes=[AllowAny],
            authentication_classes=[CookieJWTAuthentication],
        ),
        name="openapi-schema",
    ),
    path(
        "api/docs/",
        TemplateView.as_view(
            template_name="swagger-ui.html",
            extra_context={"schema_url": "openapi-schema"},
        ),
        name="swagger-ui",
    ),
]

# 開発環境でのみMEDIAファイルを提供
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
