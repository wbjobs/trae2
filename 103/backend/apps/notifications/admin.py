from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['user', 'type', 'title', 'is_read', 'created_at']
    list_filter = ['type', 'is_read', 'user']
    search_fields = ['title', 'content', 'user__real_name']
    readonly_fields = ['created_at', 'read_at']
