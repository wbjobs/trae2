"""
使用记录路由
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'', views.UseRecordViewSet, basename='use-record')

urlpatterns = [
    path('', include(router.urls)),
]
