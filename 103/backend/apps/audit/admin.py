"""
操作审计后台管理
"""
from django.contrib import admin
from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['id', 'user_name', 'action_text', 'module_text',
                    'resource_type', 'resource_id', 'ip_address', 'created_at']
    list_filter = ['action', 'module', 'created_at']
    search_fields = ['user__real_name', 'detail', 'ip_address']
    readonly_fields = ['id', 'user', 'action', 'module', 'resource_type',
                       'resource_id', 'detail', 'old_value', 'new_value',
                       'ip_address', 'user_agent', 'created_at']
    date_hierarchy = 'created_at'
    ordering = ['-created_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
