"""
文件存储路由
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'', views.FileViewSet, basename='file')

urlpatterns = [
    path('', include(router.urls)),
]
