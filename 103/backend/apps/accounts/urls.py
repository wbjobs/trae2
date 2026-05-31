"""
用户与权限路由
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'users', views.UserViewSet, basename='user')
router.register(r'roles', views.RoleViewSet, basename='role')
router.register(r'permissions', views.PermissionViewSet, basename='permission')

urlpatterns = [
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),
    path('profile/', views.get_profile, name='profile'),
    path('profile/update/', views.update_profile, name='profile-update'),
    path('change-password/', views.change_password, name='change-password'),
    path('initialize/', views.initialize_system, name='initialize'),
    path('', include(router.urls)),
]
