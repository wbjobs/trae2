"""
预约管理序列化器
"""
from rest_framework import serializers
from .models import Reservation
from apps.accounts.serializers import UserSimpleSerializer
from apps.instruments.serializers import InstrumentSimpleSerializer


class ReservationSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.real_name', read_only=True)
    user_avatar = serializers.CharField(source='user.avatar', read_only=True, default='')
    instrument_name = serializers.CharField(source='instrument.name', read_only=True)
    instrument_code = serializers.CharField(source='instrument.code', read_only=True)
    status_text = serializers.CharField(read_only=True)
    duration_hours = serializers.FloatField(read_only=True)
    can_cancel = serializers.BooleanField(read_only=True)
    can_approve = serializers.BooleanField(read_only=True)
    can_start = serializers.BooleanField(read_only=True)
    can_complete = serializers.BooleanField(read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.real_name', read_only=True, default='')
    cancelled_by_name = serializers.CharField(source='cancelled_by.real_name', read_only=True, default='')

    class Meta:
        model = Reservation
        fields = [
            'id', 'user', 'user_name', 'user_avatar',
            'instrument', 'instrument_name', 'instrument_code',
            'start_time', 'end_time', 'duration_hours',
            'purpose', 'experiment_project',
            'status', 'status_text',
            'approved_by', 'approved_by_name', 'approved_at', 'reject_reason',
            'cancel_reason', 'cancelled_at', 'cancelled_by', 'cancelled_by_name',
            'can_cancel', 'can_approve', 'can_start', 'can_complete',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        if 'start_time' in attrs and 'end_time' in attrs:
            if attrs['end_time'] <= attrs['start_time']:
                raise serializers.ValidationError('结束时间必须大于开始时间')
        return attrs


class ReservationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reservation
        fields = ['instrument', 'start_time', 'end_time', 'purpose', 'experiment_project']

    def validate(self, attrs):
        if attrs['end_time'] <= attrs['start_time']:
            raise serializers.ValidationError('结束时间必须大于开始时间')

        from django.utils import timezone
        if attrs['start_time'] <= timezone.now():
            raise serializers.ValidationError('开始时间必须晚于当前时间')

        duration = (attrs['end_time'] - attrs['start_time']).total_seconds() / 3600
        if duration < 0.5:
            raise serializers.ValidationError('预约时长不能小于30分钟')
        if duration > 8:
            raise serializers.ValidationError('预约时长不能超过8小时')

        instrument = attrs['instrument']
        if instrument.reservation_lead_days:
            days_ahead = (attrs['start_time'].date() - timezone.now().date()).days
            if days_ahead > instrument.reservation_lead_days:
                raise serializers.ValidationError(
                    f'该仪器最多可提前 {instrument.reservation_lead_days} 天预约'
                )

        return attrs


class ReservationApproveSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject'], required=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)


class ReservationCalendarSerializer(serializers.Serializer):
    date = serializers.DateField()
    reservations = ReservationSerializer(many=True)
