"""
操作审计序列化器
"""
from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    action_text = serializers.CharField(read_only=True)
    module_text = serializers.CharField(read_only=True)
    user_name = serializers.CharField(read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'user_name', 'action', 'action_text',
                  'module', 'module_text', 'resource_type', 'resource_id',
                  'detail', 'old_value', 'new_value', 'ip_address',
                  'user_agent', 'created_at']
        read_only_fields = fields


class AuditLogStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    by_action = serializers.DictField()
    by_module = serializers.DictField()
    daily_stats = serializers.DictField()
