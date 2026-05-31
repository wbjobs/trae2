"""
使用记录序列化器
"""
from rest_framework import serializers
from .models import UseRecord, InstrumentEvaluation, ViolationRecord
from apps.accounts.serializers import UserSimpleSerializer
from apps.instruments.serializers import InstrumentSimpleSerializer


class UseRecordSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.real_name', read_only=True)
    user_avatar = serializers.CharField(source='user.avatar', read_only=True, default='')
    instrument_name = serializers.CharField(source='instrument.name', read_only=True)
    instrument_code = serializers.CharField(source='instrument.code', read_only=True)
    files = serializers.SerializerMethodField()

    class Meta:
        model = UseRecord
        fields = [
            'id', 'reservation', 'instrument', 'instrument_name', 'instrument_code',
            'user', 'user_name', 'user_avatar',
            'start_time', 'end_time', 'usage_duration',
            'experiment_content', 'sample_info', 'result_summary', 'anomalies',
            'files', 'created_at'
        ]
        read_only_fields = ['created_at']

    def get_files(self, obj):
        from apps.files.models import File
        from apps.files.serializers import FileSimpleSerializer
        files = File.objects.filter(use_record=obj)
        return FileSimpleSerializer(files, many=True).data


class UseRecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = UseRecord
        fields = [
            'reservation', 'instrument', 'start_time', 'end_time',
            'experiment_content', 'sample_info', 'result_summary', 'anomalies'
        ]

    def validate(self, attrs):
        if 'end_time' in attrs and attrs['end_time'] <= attrs['start_time']:
            raise serializers.ValidationError('结束时间必须大于开始时间')
        return attrs


class UseRecordDetailSerializer(UseRecordSerializer):
    reservation_info = serializers.SerializerMethodField()

    class Meta(UseRecordSerializer.Meta):
        fields = UseRecordSerializer.Meta.fields + ['reservation_info']

    def get_reservation_info(self, obj):
        if obj.reservation:
            return {
                'id': str(obj.reservation.id),
                'purpose': obj.reservation.purpose,
                'experiment_project': obj.reservation.experiment_project,
                'status': obj.reservation.status,
                'status_text': obj.reservation.status_text,
            }
        return None


class UseRecordStatsSerializer(serializers.Serializer):
    total_records = serializers.IntegerField()
    total_hours = serializers.FloatField()
    instrument_count = serializers.IntegerField()
    month_records = serializers.IntegerField()


class InstrumentEvaluationSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.real_name', read_only=True)
    instrument_name = serializers.CharField(source='instrument.name', read_only=True)

    class Meta:
        model = InstrumentEvaluation
        fields = [
            'id', 'instrument', 'instrument_name', 'use_record', 'user', 'user_name',
            'rating', 'content', 'tags', 'created_at'
        ]
        read_only_fields = ['created_at']


class InstrumentEvaluationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstrumentEvaluation
        fields = ['rating', 'content', 'tags']

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('评分必须在1-5之间')
        return value


class ViolationRecordSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.real_name', read_only=True)
    reported_by_name = serializers.CharField(source='reported_by.real_name', read_only=True)
    instrument_name = serializers.CharField(source='instrument.name', read_only=True)
    resolved_by_name = serializers.CharField(source='resolved_by.real_name', read_only=True, default='')
    violation_type_text = serializers.CharField(source='get_violation_type_display', read_only=True)
    severity_text = serializers.CharField(source='get_severity_display', read_only=True)
    status_text = serializers.CharField(source='get_status_display', read_only=True)
    penalty_text = serializers.CharField(source='get_penalty_display', read_only=True, default='')

    class Meta:
        model = ViolationRecord
        fields = [
            'id', 'instrument', 'instrument_name', 'use_record',
            'user', 'user_name', 'reported_by', 'reported_by_name',
            'violation_type', 'violation_type_text', 'severity', 'severity_text',
            'description', 'status', 'status_text', 'penalty', 'penalty_text',
            'appeal_reason', 'resolved_by', 'resolved_by_name', 'resolved_at', 'created_at'
        ]
        read_only_fields = ['created_at']


class ViolationRecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ViolationRecord
        fields = ['violation_type', 'severity', 'description']


class ViolationAppealSerializer(serializers.Serializer):
    appeal_reason = serializers.CharField()


class ViolationResolveSerializer(serializers.Serializer):
    status = serializers.CharField()
    penalty = serializers.CharField(required=False, allow_blank=True)
