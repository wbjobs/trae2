from django.contrib import admin
from .models import Instrument, InstrumentCategory, InstrumentMaintenance


@admin.register(InstrumentCategory)
class InstrumentCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'created_at']
    search_fields = ['name', 'code']


@admin.register(Instrument)
class InstrumentAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'model', 'category', 'status', 'location', 'created_at']
    list_filter = ['status', 'category', 'requires_approval']
    search_fields = ['name', 'code', 'model', 'manufacturer']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(InstrumentMaintenance)
class InstrumentMaintenanceAdmin(admin.ModelAdmin):
    list_display = ['instrument', 'type', 'title', 'scheduled_date', 'status', 'created_at']
    list_filter = ['type', 'status']
    search_fields = ['title', 'instrument__name', 'operator']
