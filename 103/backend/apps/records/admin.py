from django.contrib import admin
from .models import UseRecord


@admin.register(UseRecord)
class UseRecordAdmin(admin.ModelAdmin):
    list_display = ['instrument', 'user', 'start_time', 'end_time', 'usage_duration', 'created_at']
    list_filter = ['instrument', 'user']
    search_fields = ['experiment_content', 'sample_info', 'result_summary',
                     'instrument__name', 'user__real_name']
    readonly_fields = ['created_at']
