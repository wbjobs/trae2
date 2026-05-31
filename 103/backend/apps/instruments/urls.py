"""
仪器管理路由
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'categories', views.InstrumentCategoryViewSet, basename='instrument-category')
router.register(r'maintenances', views.InstrumentMaintenanceViewSet, basename='instrument-maintenance')
router.register(r'', views.InstrumentViewSet, basename='instrument')

urlpatterns = [
    path('', include(router.urls)),
]
