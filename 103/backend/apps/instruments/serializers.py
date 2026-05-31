"""
仪器管理序列化器
"""
from rest_framework import serializers
from .models import Instrument, InstrumentCategory, InstrumentMaintenance
from apps.accounts.serializers import UserSimpleSerializer


class InstrumentCategorySerializer(serializers.ModelSerializer):
    instrument_count = serializers.SerializerMethodField()

    class Meta:
        model = InstrumentCategory
        fields = ['id', 'name', 'code', 'description', 'instrument_count', 'created_at']

    def get_instrument_count(self, obj):
        return obj.instruments.count()


class InstrumentSimpleSerializer(serializers.ModelSerializer):
    status_text = serializers.CharField(read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, default='')

    class Meta:
        model = Instrument
        fields = ['id', 'name', 'code', 'model', 'status', 'status_text',
                  'location', 'category_name', 'image']


class InstrumentSerializer(serializers.ModelSerializer):
    status_text = serializers.CharField(read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    is_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = Instrument
        fields = ['id', 'name', 'code', 'model', 'manufacturer', 'location',
                  'category', 'category_name', 'status', 'status_text', 'is_available',
                  'description', 'specifications', 'image', 'requires_approval',
                  'daily_max_hours', 'reservation_lead_days', 'min_reservation_hours',
                  'max_reservation_hours', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class InstrumentDetailSerializer(InstrumentSerializer):
    recent_maintenances = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()

    class Meta(InstrumentSerializer.Meta):
        fields = InstrumentSerializer.Meta.fields + ['recent_maintenances', 'stats']

    def get_recent_maintenances(self, obj):
        maintenances = obj.maintenances.all()[:5]
        return InstrumentMaintenanceSerializer(maintenances, many=True).data

    def get_stats(self, obj):
        from apps.reservations.models import Reservation
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()
        month_ago = now - timedelta(days=30)

        total_reservations = Reservation.objects.filter(instrument=obj).count()
        month_reservations = Reservation.objects.filter(
            instrument=obj,
            created_at__gte=month_ago
        ).count()
        total_hours = sum([
            (r.end_time - r.start_time).total_seconds() / 3600
            for r in Reservation.objects.filter(instrument=obj, status='completed')
        ])

        return {
            'total_reservations': total_reservations,
            'month_reservations': month_reservations,
            'total_usage_hours': round(total_hours, 2)
        }


class InstrumentMaintenanceSerializer(serializers.ModelSerializer):
    instrument_name = serializers.CharField(source='instrument.name', read_only=True)
    type_text = serializers.CharField(source='get_type_display', read_only=True)
    status_text = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = InstrumentMaintenance
        fields = ['id', 'instrument', 'instrument_name', 'type', 'type_text',
                  'title', 'description', 'scheduled_date', 'actual_date',
                  'operator', 'cost', 'status', 'status_text', 'remarks', 'created_at']
        read_only_fields = ['created_at']


class TimeSlotSerializer(serializers.Serializer):
    date = serializers.DateField()
    start = serializers.TimeField(format='%H:%M')
    end = serializers.TimeField(format='%H:%M')
    status = serializers.ChoiceField(choices=['available', 'reserved', 'expired'])
    reservation_id = serializers.UUIDField(required=False, allow_null=True)
    reserved_by = serializers.CharField(required=False, allow_null=True)
