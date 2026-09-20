from django.contrib import admin
from django.urls import include, path

from .admin_views import LogDownloadView
from .views import HealthCheckView


urlpatterns = [
    path(
        "admin/",
        admin.site.urls,
    ),

    path(
        "api/admin/logs/download/",
        LogDownloadView.as_view(),
        name="log-download",
    ),

    path(
        "api/health/",
        HealthCheckView.as_view(),
        name="health-check",
    ),

    path(
        "api/",
        include("documents.urls"),
    ),

    path(
        "api/",
        include("conversations.urls"),
    ),

    path(
        "api/auth/",
        include("accounts.urls"),
    ),
]