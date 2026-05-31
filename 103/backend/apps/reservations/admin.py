from django.contrib import admin
from .models import Reservation


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ['instrument', 'user', 'start_time', 'end_time', 'status', 'created_at']
    list_filter = ['status', 'instrument', 'user']
    search_fields = ['purpose', 'experiment_project', 'user__real_name', 'instrument__name']
    readonly_fields = ['created_at', 'updated_at']
