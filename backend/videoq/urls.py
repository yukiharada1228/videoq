"""
URL configuration for videoq project.

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

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import (SpectacularAPIView, SpectacularRedocView,
                                   SpectacularSwaggerView)

from app.presentation.common.health import HealthCheckView
from app.presentation.oauth.views import (
    AuthorizationServerMetadataView,
    ProtectedResourceMetadataView,
)

urlpatterns = [
    path("api/health/", HealthCheckView.as_view(), name="health"),
    path("api/admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/auth/", include("app.presentation.auth.urls")),
    path("api/chat/", include("app.presentation.chat.urls")),
    path("api/videos/", include("app.presentation.video.urls")),
    path("api/evaluation/", include("app.presentation.evaluation.urls")),
    path("api/mcp/", include("app.presentation.mcp.urls")),
    # Tolerate ``/api/mcp`` (no trailing slash). Django's ``APPEND_SLASH``
    # middleware would otherwise 301 to ``/api/mcp/``, which Claude.ai's
    # Remote MCP connector cannot follow on a POST and surfaces as
    # "Couldn't reach the MCP server". Registering the include twice
    # routes both forms to the same view; the canonical with-slash form
    # is registered first so ``reverse('mcp-endpoint')`` returns it.
    path("api/mcp", include("app.presentation.mcp.urls")),
    path("api/oauth/", include("app.presentation.oauth.urls")),
    # OAuth metadata documents (RFC 8414 / RFC 9728). Per the specs these
    # must live at the well-known path under the resource origin.
    path(
        ".well-known/oauth-authorization-server",
        AuthorizationServerMetadataView.as_view(),
        name="oauth-authorization-server-metadata",
    ),
    path(
        ".well-known/oauth-protected-resource/api/mcp",
        ProtectedResourceMetadataView.as_view(),
        name="oauth-protected-resource-metadata",
    ),
    # Also serve the same document at the bare ``/.well-known/oauth-protected-resource``
    # path. RFC 9728 path-concatenates the resource path onto the well-known
    # prefix, but Claude.ai's Remote MCP connector additionally probes the bare
    # path and treats a 404 here as "server is not an MCP-compliant resource",
    # giving up before it even opens the authorize URL (observed via gunicorn
    # access logs during the ofid_5a2b07ad211b3330 attempt).
    path(
        ".well-known/oauth-protected-resource",
        ProtectedResourceMetadataView.as_view(),
        name="oauth-protected-resource-metadata-bare",
    ),
    path("api/", include("app.urls")),
    path("api/v1/", include("app.presentation.chat.openai_urls")),
]

# Serve MEDIA files only in development environment
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
