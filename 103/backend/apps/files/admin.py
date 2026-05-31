from django.contrib import admin
from .models import File, FileVersion, FileDownloadLog


@admin.register(File)
class FileAdmin(admin.ModelAdmin):
    list_display = ['name', 'original_name', 'size', 'category', 'uploaded_by', 'download_count', 'created_at']
    list_filter = ['category', 'instrument']
    search_fields = ['name', 'original_name', 'description', 'tags']
    readonly_fields = ['created_at', 'updated_at', 'download_count']


@admin.register(FileVersion)
class FileVersionAdmin(admin.ModelAdmin):
    list_display = ['file', 'version', 'name', 'size', 'created_by', 'created_at']
    list_filter = ['version']
    search_fields = ['file__name', 'name']


@admin.register(FileDownloadLog)
class FileDownloadLogAdmin(admin.ModelAdmin):
    list_display = ['file', 'downloaded_by', 'ip_address', 'created_at']
    list_filter = ['file']
    search_fields = ['file__name', 'ip_address']
