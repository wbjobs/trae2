from django.contrib import admin
from .models import User, Role, Permission, RolePermission


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['username', 'real_name', 'email', 'role', 'is_active', 'created_at']
    list_filter = ['is_active', 'role', 'department']
    search_fields = ['username', 'real_name', 'email']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'is_system', 'created_at']
    list_filter = ['is_system']
    search_fields = ['name', 'code']


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'module', 'created_at']
    list_filter = ['module']
    search_fields = ['name', 'code']


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = ['role', 'permission', 'created_at']
    list_filter = ['role']
