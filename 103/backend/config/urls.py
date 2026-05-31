"""
URL configuration for lab-reservation-system project.
"""
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

urlpatterns = [
    path('admin/', admin.site.urls),

    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    path('api/auth/', include('apps.accounts.urls')),
    path('api/users/', include('apps.accounts.urls')),
    path('api/instruments/', include('apps.instruments.urls')),
    path('api/reservations/', include('apps.reservations.urls')),
    path('api/records/', include('apps.records.urls')),
    path('api/audit-logs/', include('apps.audit.urls')),
    path('api/files/', include('apps.files.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
]
