"""
预约管理路由
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'', views.ReservationViewSet, basename='reservation')

urlpatterns = [
    path('', include(router.urls)),
]
